import { getLinkedSession, setActivePlatformForWorkflowSession } from "../../common/sessions";
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

export async function createWorkflowId(platform: string, chatId: string): Promise<string> {
    // Check in the database if this user has a 'unified' workflow. If so, use that workflowId instead of creating a telegram one.
    const unified = await getLinkedSession(platform, chatId);
    if (unified) {
        // Update the WorkflowSession to set the activePlatform to the current platform
        await setActivePlatformForWorkflowSession(unified, platform);
        return JSON.stringify({
            platform: "unified",
            chatId: unified,
            type: "agent"
        });
    }

    return JSON.stringify({
        platform,
        chatId,
        type: "agent"
    });
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

    const workflowId = await createWorkflowId("telegram", Config.TELEGRAM_BOT_ADMIN);
    return signalAgenticWorkflowMessage(workflowId, author, message);
}

export async function signalAgenticWorkflowAdminExternalContext(author: string, message: string) {
    if (!Config.TELEGRAM_BOT_ADMIN) {
        Logger.info(undefined, `signalAgenticWorkflowAdminExternalContext: author=${author}, message=${message}`);
        return;
    }

    const workflowId = await createWorkflowId("telegram", Config.TELEGRAM_BOT_ADMIN);
    return signalAgenticWorkflowExternalContext(workflowId, author, message);
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