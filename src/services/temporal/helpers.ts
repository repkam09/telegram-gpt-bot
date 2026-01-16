import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/consumer";
import { createAdminUser, createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowExternalContextSignal, agentWorkflowMessageSignal, createWorkflowId } from "./workflows/agentic";

export async function signalAgenticWorkflowMessage(user: HennosUser, platform: string, message: string) {
    if (!user.isAdmin()) {
        throw new Error("Only admin users can signal the agentic workflow.");
    }

    const workflowId = createWorkflowId(platform, { userId: user.chatId, channelId: user.chatId });

    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{
            user: createAdminUser(String(user.chatId), user.displayName),
            aggressiveContinueAsNew: false,
        }],
        signal: agentWorkflowMessageSignal,
        signalArgs: [message, new Date().toISOString()],
    });
}

export async function signalAgenticWorkflowExternalContext(user: HennosUser, platform: string, content: string, author: string) {
    if (!user.isAdmin()) {
        throw new Error("Only admin users can signal the agentic workflow.");
    }

    const workflowId = createWorkflowId(platform, { userId: user.chatId, channelId: user.chatId });

    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{
            user: createAdminUser(String(user.chatId), user.displayName),
            aggressiveContinueAsNew: false,
        }],
        signal: agentWorkflowExternalContextSignal,
        signalArgs: [content, author, new Date().toISOString()],
    });
}