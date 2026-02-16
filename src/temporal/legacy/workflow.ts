import {
    condition,
    continueAsNew,
    defineSignal,
    proxyActivities,
    setHandler,
    workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import { LegacyWorkflowInput } from "./interface";
import { CompletionContextEntry } from "../../provider";

const { persistLegacyAgentMessage } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
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

    await condition(() => pending.length > 0);
    let iterations = 0;

    while (iterations < 15) {
        try {
            const context: CompletionContextEntry[] = [];

            // grab all the pending messages and put them into context
            while (pending.length > 0) {
                const entry = pending.shift()!;
                context.push({ role: "user", content: `${entry.author}: ${entry.message}` });
            }

            const agentThought = await legacyCompletion({ context: context, iterations });
            if (agentThought.__type === "string") {
                await persistLegacyAgentMessage({
                    workflowId: workflowInfo().workflowId,
                    name: "assistant",
                    type: "agent-message",
                    message: agentThought.payload,
                });

                return continueAsNew<typeof legacyWorkflow>({
                    continueAsNew: {
                        pending,
                    },
                });
            }

            if (agentThought.__type === "action") {
                context.push({ role: "tool_call", name: agentThought.payload.name, input: agentThought.payload.input, id: agentThought.payload.id });
                const actionResult = await legacyAction(
                    agentThought.payload.name,
                    agentThought.payload.input,
                );
                context.push({ role: "tool_response", id: agentThought.payload.id, result: actionResult });
            }

            iterations++;
        } catch {
            // Log error and continue - activity failures are transient
            iterations++;
        }
    }

    throw new Error("Max iterations reached in legacy workflow");
}

