import {
    condition,
    continueAsNew,
    defineSignal,
    proxyActivities,
    setHandler,
    workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { HennosWorkflowUser } from "../common/types";

export function createWorkflowId(platform: string, data: object): string {
    const payload = JSON.stringify({
        platform,
        ...data,
    });
    return Buffer.from(payload).toString("base64");
}

export function parseWorkflowId(workflowId: string): { platform: string;[key: string]: unknown } {
    const decoded = Buffer.from(workflowId, "base64").toString("utf-8");
    return JSON.parse(decoded);
}

const { action, broadcast, tokens } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { thought } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { compact, observation } = proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

type PendingMessage = {
    message: string;
    date: string;
}

export type AgentWorkflowInput = {
    user: HennosWorkflowUser;
    aggressiveContinueAsNew: boolean;
    continueAsNew?: {
        context: string[];
        pending: PendingMessage[];
        userRequestedExit: boolean;
    };
};

export const agentWorkflowMessageSignal = defineSignal<[string, string]>(
    "agentWorkflowMessage",
);

export const agentWorkflowExitSignal = defineSignal("agentWorkflowExit");

export async function agentWorkflow(input: AgentWorkflowInput): Promise<void> {
    const context: string[] = input.continueAsNew
        ? input.continueAsNew.context
        : [];

    const pending: PendingMessage[] = input.continueAsNew
        ? input.continueAsNew.pending
        : [];

    let userRequestedExit = input.continueAsNew
        ? input.continueAsNew.userRequestedExit
        : false;

    setHandler(agentWorkflowMessageSignal, (message: string, date: string) => {
        pending.push({
            message,
            date,
        });
    });

    setHandler(agentWorkflowExitSignal, () => {
        userRequestedExit = true;
    });

    // Wait for the first message to arrive
    await condition(() => pending.length > 0 || userRequestedExit);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (userRequestedExit) {
            return;
        }
        // grab all the pending messages and put them into context
        while (pending.length > 0) {
            const entry = pending.shift()!;

            await broadcast({
                workflowId: workflowInfo().workflowId,
                user: input.user,
                type: "user-message",
                message: entry.message,
            });

            context.push(`<user_message date="${entry.date}">\n${entry.message}\n</user_message>`);
        }

        const agentThought = await thought(input.user, context);

        context.push(`<thought>\n${agentThought.thought}\n</thought>`);

        if (agentThought.__type === "answer") {
            await broadcast({
                workflowId: workflowInfo().workflowId,
                user: input.user,
                type: "agent-message",
                message: agentThought.answer,
            });

            context.push(`<answer>\n${agentThought.answer}\n</answer>`);

            if (input.aggressiveContinueAsNew) {
                const compactContext = await compact(input.user, context);

                return continueAsNew<typeof agentWorkflow>({
                    user: input.user,
                    aggressiveContinueAsNew: input.aggressiveContinueAsNew,
                    continueAsNew: {
                        context: compactContext.context,
                        pending,
                        userRequestedExit
                    },
                });
            } else {
                // wait for new messages or exit signal
                await condition(() => pending.length > 0 || userRequestedExit);
            }
        }

        if (agentThought.__type === "action") {
            context.push(
                `<action><reason>\n${agentThought.action.reason}\n</reason><name>${agentThought.action.name}</name><input>${JSON.stringify(agentThought.action.input)}</input></action>`,
            );

            const agentAction = await action(
                input.user,
                agentThought.action.name,
                agentThought.action.input,
            );

            const agentObservation = await observation(
                input.user,
                context,
                agentAction,
            );

            context.push(
                `<observation>\n${agentObservation.observations}\n</observation>`,
            );

            const tokenCount = await tokens(input.user, context);
            const passedTokenLimit = tokenCount.tokenCount > tokenCount.tokenLimit;

            if (workflowInfo().continueAsNewSuggested || passedTokenLimit) {
                const compactContext = await compact(input.user, context);
                return continueAsNew<typeof agentWorkflow>({
                    user: input.user,
                    aggressiveContinueAsNew: input.aggressiveContinueAsNew,
                    continueAsNew: {
                        context: compactContext.context,
                        pending,
                        userRequestedExit
                    },
                });
            }
        }
    }
}
