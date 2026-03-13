import {
    allHandlersFinished,
    condition,
    continueAsNew,
    defineSignal,
    proxyActivities,
    setHandler,
    workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import { LegacyWorkflowInput } from "./interface";
import { CompletionContextToolCallEntry, CompletionContextToolResponseEntry } from "../../provider";

type WorkflowContextEntry = CompletionContextToolCallEntry | CompletionContextToolResponseEntry;

const { persistLegacyAgentMessage, persistLegacyUserMessage, broadcastLegacyAgentMessage } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { classifyPromptComplexity } = proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 3,
    },
});

const { legacyCompletion, legacyAction } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

export const legacyWorkflowMessageSignal = defineSignal<[string, string, string]>(
    "legacyWorkflowMessage",
);

export async function legacyWorkflow(input: LegacyWorkflowInput): Promise<void> {
    const pending = input.continueAsNew
        ? input.continueAsNew.pending
        : [];

    setHandler(legacyWorkflowMessageSignal, (message: string, author: string, date: string) => {
        pending.push({
            message,
            author,
            date,
        });
    });

    let tools: WorkflowContextEntry[] = [];
    let iterations = 0;

    await condition(() => pending.length > 0);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            // grab all the pending messages and put them into the database
            while (pending.length > 0) {
                const entry = pending.shift()!;
                await persistLegacyUserMessage({
                    name: entry.author,
                    message: entry.message,
                });
            }

            const classification = await classifyPromptComplexity({
                iterations,
                hasToolContext: tools.length > 0,
            });

            const agentThought = await legacyCompletion({ context: tools, iterations, classification });
            if (agentThought.__type === "string") {
                await persistLegacyAgentMessage({
                    message: agentThought.payload,
                });

                await broadcastLegacyAgentMessage({
                    message: agentThought.payload,
                });

                if (workflowInfo().continueAsNewSuggested) {
                    await allHandlersFinished();
                    return continueAsNew<typeof legacyWorkflow>({
                        continueAsNew: {
                            pending,
                        },
                    });
                } else {
                    tools = [];
                    iterations = 0;
                    await condition(() => pending.length > 0);
                }
            }

            if (agentThought.__type === "action") {
                tools.push({ role: "tool_call", name: agentThought.payload.name, input: agentThought.payload.input, id: agentThought.payload.id });
                const actionResult = await legacyAction(
                    agentThought.payload.name,
                    agentThought.payload.input,
                );
                tools.push({ role: "tool_response", id: agentThought.payload.id, result: actionResult });
                iterations++;
            }

        } catch {
            // Log error and continue - activity failures are transient
            iterations++;
        }
    }
}

