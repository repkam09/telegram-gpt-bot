import { Database } from "../../database";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { legacyWorkflow, legacyWorkflowMessageSignal } from "./workflow";
import type { WorkflowStreamState } from "@temporalio/workflow-streams/workflow";

export type PendingMessage = {
    author: string;
    message: string;
    date: string;
    responseId?: number;
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

export async function signalLegacyWorkflowMessage(workflowId: string, author: string, message: string, responseId?: number) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(legacyWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: legacyWorkflowMessageSignal,
        signalArgs: [message, author, new Date().toISOString(), responseId],
    });
}

export async function signalLegacyWorkflowAdminMessageExternalContext(author: string, message: string) {
    if (!Config.TELEGRAM_BOT_ADMIN) {
        Logger.info(undefined, `signalLegacyWorkflowAdminMessageExternalContext: author=${author}, message=${message}`);
        return;
    }

    const workflowId = createWorkflowId("telegram", Config.TELEGRAM_BOT_ADMIN);
    return signalLegacyWorkflowExternalContext(workflowId, author, message);
}

export async function signalLegacyWorkflowExternalContext(workflowId: string, author: string, content: string) {
    const flow = parseWorkflowId(workflowId);
    const db = Database.instance();

    Logger.debug(workflowId, `Updating legacy workflow database for: ${workflowId}, author: ${author}, content: ${content}`);

    try {
        await db.messages.create({
            data: {
                chatId: Number(flow.chatId),
                role: "user",
                content,
                from: Number(flow.chatId)
            }
        });
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(workflowId, `Failed to update legacy workflow database for: ${workflowId}, author: ${author}, content: ${content}`, error);
        throw err;
    }
}

export async function signalLegacyWorkflowAdminMessage(author: string, message: string) {
    if (!Config.TELEGRAM_BOT_ADMIN) {
        Logger.info(undefined, `signalLegacyWorkflowAdminMessage: author=${author}, message=${message}`);
        return;
    }

    const workflowId = createWorkflowId("telegram", Config.TELEGRAM_BOT_ADMIN);
    return signalLegacyWorkflowMessage(workflowId, author, message);
}

export async function signalLegacyWorkflowImageMessage(workflowId: string, author: string, path: string, mime: string) {
    const flow = parseWorkflowId(workflowId);
    const db = Database.instance();

    Logger.debug(workflowId, `Updating legacy workflow database for: ${workflowId}, author: ${author}, path: ${path}, mime: ${mime}`);

    try {
        await db.messages.create({
            data: {
                chatId: Number(flow.chatId),
                role: "user",
                type: "image",
                content: JSON.stringify({
                    local: path,
                    mime: mime,
                }),
                from: Number(flow.chatId)
            }
        });
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(workflowId, `Failed to update legacy workflow database for: ${workflowId}, author: ${author}, path: ${path}, mime: ${mime}`, error);
        throw err;
    }
}

export type LegacyWorkflowInput = {
    continueAsNew?: {
        pending: PendingMessage[];
        streamState?: WorkflowStreamState;
    };
};