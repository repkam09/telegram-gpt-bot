/**
 * AI Agent: Expert in Oldschool RuneScape news, topics, stats, items, prices, etc.
 */

import { ActivityFailure, condition, continueAsNew, defineSignal, proxyActivities, setHandler, workflowInfo } from "@temporalio/workflow";
import { GemstoneAgentContext, GemstoneAgentWorkflowInput, PendingMessage } from "./interface";
import type * as activities from "./activities";

const { persistGemstoneAgentMessage, gemstoneTokens } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { gemstoneThought, gemstoneAction } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { gemstoneCompact, gemstoneObservation } = proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

export const gemstoneAgentWorkflowMessageSignal = defineSignal<[string, string, string]>(
    "gemstoneAgentWorkflowMessage",
);

export const gemstoneAgentWorkflowExitSignal = defineSignal("gemstoneAgentWorkflowExit");
export const gemstoneAgentWorkflowContinueAsNew = defineSignal("gemstoneAgentWorkflowContinueAsNew");

export async function gemstoneAgentWorkflow(input: GemstoneAgentWorkflowInput): Promise<void> {
    const context: GemstoneAgentContext[] = input.continueAsNew
        ? input.continueAsNew.context
        : [];

    const pending: PendingMessage[] = input.continueAsNew
        ? input.continueAsNew.pending
        : [];

    let userRequestedExit = input.continueAsNew
        ? input.continueAsNew.userRequestedExit
        : false;

    let userRequestedContinueAsNew = false;

    setHandler(gemstoneAgentWorkflowMessageSignal, (message: string, author: string, date: string) => {
        pending.push({
            message,
            author,
            date,
        });
    });

    setHandler(gemstoneAgentWorkflowExitSignal, () => {
        userRequestedExit = true;
    });

    setHandler(gemstoneAgentWorkflowContinueAsNew, () => {
        userRequestedContinueAsNew = true;
    });

    const continueCondition = async () => {
        return condition(() => pending.length > 0 || userRequestedExit || userRequestedContinueAsNew);
    };

    const compactAndContinueAsNew = async () => {
        const compactContext = await gemstoneCompact({ context });
        return continueAsNew<typeof gemstoneAgentWorkflow>({
            continueAsNew: {
                context: compactContext.context,
                pending,
                userRequestedExit
            },
        });
    };

    // Wait for the first message to arrive
    await continueCondition();

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            if (userRequestedExit) {
                return;
            }

            if (userRequestedContinueAsNew) {
                return compactAndContinueAsNew();
            }

            // grab all the pending messages and put them into context
            while (pending.length > 0) {
                const entry = pending.shift()!;
                context.push({ role: "user", content: `${entry.author}: ${entry.message}` });
            }

            const agentThought = await gemstoneThought({ context });
            if (agentThought.__type === "string") {
                await persistGemstoneAgentMessage({
                    workflowId: workflowInfo().workflowId,
                    name: "assistant",
                    type: "agent-message",
                    message: agentThought.payload,
                });

                context.push({ role: "assistant", content: agentThought.payload });

                const tokenCount = await gemstoneTokens(context.map((entry) => entry.content));
                const passedTokenLimit = tokenCount.tokenCount > tokenCount.tokenLimit;

                if (workflowInfo().continueAsNewSuggested || passedTokenLimit) {
                    return compactAndContinueAsNew();
                }

                // wait for new messages or exit signal
                await continueCondition();
            }


            if (agentThought.__type === "action") {
                context.push(
                    { role: "assistant", content: `<action>\n<name>${agentThought.payload.name}</name>\n<input>${JSON.stringify(agentThought.payload.input)}</input>\n</action>` },
                );

                const actionResult = await gemstoneAction(
                    agentThought.payload.name,
                    agentThought.payload.input,
                );

                const agentObservation = await gemstoneObservation(
                    { context: context.slice(-5), actionResult },
                );

                context.push(
                    { role: "assistant", content: `<observation>\n${agentObservation.observations}\n</observation>` },
                );
            }
        } catch (error: unknown) {
            if (error instanceof ActivityFailure) {
                const activityError = error.cause;
                context.push(
                    { role: "assistant", content: `<error>\nTemporal ActivityFailure: ${activityError?.message}\n</error>` },
                );
            } else {
                context.push({ role: "assistant", content: `<error>\nUnknown Error: ${(error as Error).message}\n</error>` });
            }
        }
    }
}