import { condition, defineSignal, proxyActivities, proxyLocalActivities, setHandler } from "@temporalio/workflow";
import { MemoryEventInput } from "./types";
import type * as activities from "./activities";

type MemoryExtractionEventSignalInput = {
    role: "user" | "assistant";
    content: string;
    userId: string;
    sessionId: string;
    date?: string;
}

export const memoryWorkflowEventSignal = defineSignal<[MemoryExtractionEventSignalInput]>(
    "memoryWorkflowEventSignal",
);

export const memoryWorkflowForcePersist = defineSignal("memoryWorkflowForcePersist");

type MemoryExtractionWorkflowInput = {
    continueAsNew?: {
        pending: MemoryEventInput[];
    }
}

const { persistMemoryEvents } = proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
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

    setHandler(memoryWorkflowEventSignal, (event: MemoryEventInput) => {
        pending.push(event);
    });

    const config = await memoryExtractionWorkflowConfig();

    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Wait for an event to be signaled, or for 4 hours to pass (whichever comes first)
        const hasEvents = await condition(() => pending.length > 0, config.timeout);
        while (pending.length > 0) {
            const event = pending.shift()!;
            events.push(event);
        }


        if (hasEvents) {
            await persistMemoryEvents({ sessionId: input.sessionId, userId: input.userId, events });
        }
    }
}