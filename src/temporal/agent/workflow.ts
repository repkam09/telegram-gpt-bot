import {
    ActivityFailure,
    condition,
    continueAsNew,
    defineQuery,
    defineSignal,
    proxyActivities,
    setHandler,
    workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import { AgentWorkflowInput, PendingMessage } from "./interface";

const { persistUserMessage, persistAgentMessage, tokens } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { thought, action } = proxyActivities<typeof activities>({
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

export const agentWorkflowQueryContext = defineQuery<string[]>("agentWorkflowQueryContext");

export const agentWorkflowMessageSignal = defineSignal<[string, string, string]>(
    "agentWorkflowMessage",
);

export const agentWorkflowExternalContextSignal = defineSignal<[string, string, string]>(
    "agentWorkflowExternalContext",
);

export const agentWorkflowExternalArtifactSignal = defineSignal<[string, string, string, string]>(
    "agentWorkflowExternalArtifact",
);

export const agentWorkflowExitSignal = defineSignal("agentWorkflowExit");
export const agentWorkflowContinueAsNew = defineSignal("agentWorkflowContinueAsNew");
export const agentWorkflowClearContext = defineSignal("agentWorkflowClearContext");

export async function agentWorkflow(input: AgentWorkflowInput): Promise<void> {
    let context: string[] = input.continueAsNew
        ? input.continueAsNew.context
        : [];

    const pending: PendingMessage[] = input.continueAsNew
        ? input.continueAsNew.pending
        : [];

    let userRequestedExit = input.continueAsNew
        ? input.continueAsNew.userRequestedExit
        : false;

    let userRequestedContinueAsNew = false;

    setHandler(agentWorkflowMessageSignal, (message: string, author: string, date: string) => {
        pending.push({
            message,
            author,
            date,
        });
    });

    setHandler(agentWorkflowExternalContextSignal, (content: string, author: string, date: string) => {
        context.push(`<external_context date="${date}" author="${author}">\n${content}\n</external_context>`);
    });

    setHandler(agentWorkflowExternalArtifactSignal, (ref: string, description: string, mimetype: string, date: string) => {
        context.push(`<external_artifact date="${date}" mimetype="${mimetype}" id="${ref}">\n<description>\n${description}\n</description>\n</external_artifact>`);
    });

    setHandler(agentWorkflowExitSignal, () => {
        userRequestedExit = true;
    });

    setHandler(agentWorkflowContinueAsNew, () => {
        userRequestedContinueAsNew = true;
    });

    setHandler(agentWorkflowClearContext, () => {
        context = [];
    });

    setHandler(agentWorkflowQueryContext, () => {
        return context;
    });

    const continueCondition = async () => {
        return condition(() => pending.length > 0 || userRequestedExit || userRequestedContinueAsNew);
    };

    const compactAndContinueAsNew = async () => {
        const compactContext = await compact({ context });
        return continueAsNew<typeof agentWorkflow>({
            continueAsNew: {
                context: compactContext.context,
                pending,
                userRequestedExit
            },
        });
    };

    // Wait for the first message to arrive
    await continueCondition();

    // There is a potential edge case here where many external context messages
    // are added before any user messages, which could cause the context to grow significantly.
    const tokenCount = await tokens(context);
    const passedTokenLimit = tokenCount.tokenCount > tokenCount.tokenLimit;

    if (workflowInfo().continueAsNewSuggested || passedTokenLimit) {
        return compactAndContinueAsNew();
    }

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

                await persistUserMessage({
                    workflowId: workflowInfo().workflowId,
                    name: entry.author,
                    type: "user-message",
                    message: entry.message,
                });

                context.push(`<user_message date="${entry.date}" author="${entry.author}">\n${entry.message}\n</user_message>`);
            }

            const agentThought = await thought({ context });
            if (agentThought.__type === "string") {
                await persistAgentMessage({
                    workflowId: workflowInfo().workflowId,
                    name: "assistant",
                    type: "agent-message",
                    message: agentThought.payload,
                });

                context.push(`<answer>\n${agentThought.payload}\n</answer>`);

                const tokenCount = await tokens(context);
                const passedTokenLimit = tokenCount.tokenCount > tokenCount.tokenLimit;

                if (workflowInfo().continueAsNewSuggested || passedTokenLimit) {
                    return compactAndContinueAsNew();
                }

                // wait for new messages or exit signal
                await continueCondition();
            }

            if (agentThought.__type == "empty") {
                await continueCondition();
                continue;
            }


            if (agentThought.__type === "action") {
                context.push(
                    `<action>\n<name>${agentThought.payload.name}</name>\n<input>${JSON.stringify(agentThought.payload.input)}</input>\n<reason>${agentThought.payload.reason}</reason>\n</action>`,
                );

                const actionResult = await action(
                    agentThought.payload.name,
                    agentThought.payload.input,
                );

                const agentObservation = await observation(
                    { context: context.slice(-5), actionResult },
                );

                context.push(
                    `<observation>\n${agentObservation.observations}\n</observation>`,
                );
            }
        } catch (error: unknown) {
            if (error instanceof ActivityFailure) {
                const activityError = error.cause;
                context.push(
                    `<error>\nTemporal ActivityFailure: ${activityError?.message}\n</error>`,
                );
            } else {
                context.push(`<error>\nUnknown Error: ${(error as Error).message}\n</error>`);
            }
        }
    }
}
