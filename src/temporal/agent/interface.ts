import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowClearContext, agentWorkflowExitSignal, agentWorkflowExternalContextSignal, agentWorkflowMessageSignal } from "./workflow";

export type PendingMessage = {
    author: string;
    message: string;
    date: string;
}

export type AgentWorkflowInput = {
    continueAsNew?: {
        context: string[];
        pending: PendingMessage[];
        userRequestedExit: boolean;
    };
};

export function createWorkflowId(platform: string, chatId: string): string {
    const payload = JSON.stringify({
        platform,
        chatId,
        type: "agent"
    });
    return payload;
}

export function parseWorkflowId(workflowId: string): { platform: string; chatId: string; type: "agent" } {
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