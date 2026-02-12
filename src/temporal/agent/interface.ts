import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowClearContext, agentWorkflowExitSignal, agentWorkflowExternalContextSignal, agentWorkflowMessageSignal } from "./workflow";

export class AgentResponseHandler {
    private static listeners: Map<string, (message: string, chatId: string) => Promise<void>> = new Map();
    private static artifactListeners: Map<string, (filePath: string, chatId: string, description?: string) => Promise<void>> = new Map();

    public static registerListener(type: string, callback: (message: string, chatId: string) => Promise<void>): void {
        this.listeners.set(type, callback);
    }

    public static registerArtifactListener(type: string, callback: (filePath: string, chatId: string, description?: string) => Promise<void>): void {
        this.artifactListeners.set(type, callback);
    }

    public static async handle(workflowId: string, message: string): Promise<void> {
        const workflowInfo = parseWorkflowId(workflowId);

        const listener = this.listeners.get(workflowInfo.platform);
        if (listener) {
            await listener(message, workflowInfo.chatId);
        } else {
            Logger.warn(undefined, `No listener registered for platform: ${workflowInfo.platform}`);
        }
    }

    public static async handleArtifact(workflowId: string, filePath: string, description?: string): Promise<void> {
        const workflowInfo = parseWorkflowId(workflowId);
        const listener = this.artifactListeners.get(workflowInfo.platform);
        if (listener) {
            await listener(filePath, workflowInfo.chatId, description);
        } else {
            Logger.warn(undefined, `No artifact listener registered for platform: ${workflowInfo.platform}`);
        }
    }
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

export async function signalAgenticWorkflowMessage(workflowId: string, author: string, message: string) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: agentWorkflowMessageSignal,
        signalArgs: [message, author, new Date().toISOString()],
    });
}

export async function signalAgenticWorkflowAdminMessage(author: string, message: string) {
    if (!Config.TELEGRAM_BOT_ADMIN) {
        Logger.info(undefined, `signalAgenticWorkflowAdminMessage: author=${author}, message=${message}`);
        return;
    }

    const workflowId = createWorkflowId("telegram", Config.TELEGRAM_BOT_ADMIN);
    return signalAgenticWorkflowMessage(workflowId, author, message);
}

export async function signalAgenticWorkflowExternalContext(workflowId: string, author: string, content: string) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: agentWorkflowExternalContextSignal,
        signalArgs: [content, author, new Date().toISOString()],
    });
}

export async function signalAgenticWorkflowClearContext(workflowId: string) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: agentWorkflowClearContext,
    });
}

export async function signalAgenticWorkflowExit(workflowId: string) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: agentWorkflowExitSignal,
    });
}

export async function queryAgenticWorkflowContext(workflowId: string): Promise<string[]> {
    const client = await createTemporalClient();
    try {
        const handle = await client.workflow.getHandle(workflowId);
        const result: string[] = await handle.query("agentWorkflowQueryContext");
        return result;
    } catch (error) {
        Logger.error(undefined, `Error querying workflow context for workflowId ${workflowId}: ${error}`);
        throw error;
    }
}