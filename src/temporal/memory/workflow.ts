import { allHandlersFinished, condition, continueAsNew, defineSignal, proxyActivities, proxyLocalActivities, setHandler } from "@temporalio/workflow";
import { MemoryEventInput } from "./types";
import type * as activities from "./activities";

export const memoryWorkflowEventSignal = defineSignal<[MemoryEventInput]>(
    "memoryWorkflowEventSignal",
);

export const memoryWorkflowForcePersist = defineSignal("memoryWorkflowForcePersist");

type MemoryExtractionWorkflowInput = {
    userId: string;
    sessionId: string;
    continueAsNew?: {
        pending: MemoryEventInput[];
    }
}

const { persistMemoryEvents } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { memoryExtractionWorkflowConfig } = proxyLocalActivities<typeof activities>({
    startToCloseTimeout: "5 seconds",
});

export async function memoryExtractionWorkflow(input: MemoryExtractionWorkflowInput): Promise<void> {
    const pending: MemoryEventInput[] = input.continueAsNew ? input.continueAsNew.pending : [];
    const events: MemoryEventInput[] = [];

    let userRequestedForcePersist = false;

    setHandler(memoryWorkflowEventSignal, (event: MemoryEventInput) => {
        pending.push(event);
    });

    setHandler(memoryWorkflowForcePersist, () => {
        userRequestedForcePersist = true;
    });

    const config = await memoryExtractionWorkflowConfig();

    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Wait for an event to be signaled, or for 4 hours to pass (whichever comes first)
        const hasEvents = await condition(() => pending.length > 0 || userRequestedForcePersist, config.timeout);
        while (pending.length > 0) {
            const event = pending.shift()!;
            events.push(event);
        }

        if (!hasEvents || userRequestedForcePersist) {
            // If no events were received for 4 hours, we can assume the session is inactive
            // and end the workflow. The workflow will be restarted when a new event is signaled for the user
            // and a new sessionId will be generated.

            if (events.length > 0) {
                await persistMemoryEvents({ sessionId: input.sessionId, userId: input.userId, events });
            }

            await allHandlersFinished();
            if (pending.length > 0) {
                // If new events were signaled while we were waiting for handlers to finish, we need to continue as new to process them
                return continueAsNew<typeof memoryExtractionWorkflow>({
                    sessionId: input.sessionId,
                    userId: input.userId,
                    continueAsNew: {
                        pending,
                    },
                });
            }

            // No new events were signaled, we can safely end the workflow
            return;
        }
    }
}