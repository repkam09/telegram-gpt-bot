import { randomUUID } from "crypto";
import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { memoryExtractionWorkflow, memoryWorkflowEventSignal } from "./workflow";
import { Logger } from "../../singletons/logger";

export async function persistMemoryEvent(workflowId: string, userId: string, role: "user" | "assistant", message: string) {
    if (!Config.HENNOS_MEMORY_ENABLED) {
        Logger.warn(workflowId, `Memory is disabled. Skipping persistMemoryEvent for userId=${userId}, role=${role}, message=${message}`);
        return;
    }

    const client = await createTemporalClient();
    await client.workflow.signalWithStart(memoryExtractionWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: `memory-${userId}`,
        args: [{
            userId,
            sessionId: randomUUID(),
        }],
        signal: memoryWorkflowEventSignal,
        signalArgs: [{
            role: role,
            content: message,
            date: new Date().toISOString(),
        }],
    });
}