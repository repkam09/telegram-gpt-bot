import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { legacyWorkflow, legacyWorkflowMessageSignal } from "./workflow";

export type PendingMessage = {
    author: string;
    message: string;
    date: string;
}

export function createWorkflowId(platform: string, chatId: string): string {
    const payload = JSON.stringify({
        platform,
        chatId,
    });
    return payload;
}

export function parseWorkflowId(workflowId: string): { platform: string; chatId: string } {
    return JSON.parse(workflowId);
}

export async function signalLegacyWorkflowMessage(workflowId: string, author: string, message: string) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(legacyWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: legacyWorkflowMessageSignal,
        signalArgs: [message, author, new Date().toISOString()],
    });
}

export type LegacyWorkflowInput = {
    continueAsNew?: {
        pending: PendingMessage[];
    };
};