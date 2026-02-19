import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { legacyWorkflow, legacyWorkflowMessageSignal } from "./workflow";

export type PendingMessage = {
    author: string;
    message: string;
    date: string;
}

export function createWorkflowId(platform: string, chatId: string): string {
    // Validate that chatId is a number, since that's what the legacy workflow expects. If it's not a number, throw an error.
    if (isNaN(Number(chatId))) {
        throw new Error(`Invalid chatId: ${chatId}, chatId must be a number for legacy workflow`);
    }
    
    const payload = JSON.stringify({
        platform,
        chatId,
        type: "legacy",
    });
    return payload;
}

export function parseWorkflowId(workflowId: string): { platform: string; chatId: string; type: "legacy" } {
    const result = JSON.parse(workflowId);
    if (!result.platform || !result.chatId || result.type !== "legacy") {
        throw new Error(`Invalid workflowId: ${workflowId}, expected JSON string with platform, chatId, and type=legacy`);
    }

    // ChatId must be a number for the legacy workflow since thats what the database expects.
    // If it's not a number, throw an error.
    if (isNaN(Number(result.chatId))) {
        throw new Error(`Invalid workflowId: ${workflowId}, chatId must be a number for legacy workflow`);
    }

    return result;
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