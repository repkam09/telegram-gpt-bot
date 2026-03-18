import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { memoryExtractionWorkflow, memoryWorkflowEventSignal } from "./workflow";
import { MemoryEventInput } from "./types";

export async function persistMemoryEvent(userId: string, sessionId: string, event: MemoryEventInput) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(memoryExtractionWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: "memory-extraction",
        args: [],
        signal: memoryWorkflowEventSignal,
        signalArgs:{
            role: event.role as "user" | "assistant",
            content: event.content,
            userId,
            sessionId,
            date: event.date || new Date().toISOString(),
        },
    });
}