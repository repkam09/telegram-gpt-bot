import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/consumer";
import { Logger } from "../../singletons/logger";
import { createAdminUser, createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowMessageSignal, createWorkflowId } from "./workflows/agentic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signalAgenticWorkflowMessage(user: HennosUser, platform: string, message: string) {
    if (!user.isAdmin()) {
        throw new Error("Only admin users can signal the agentic workflow.");
    }

    Logger.trace(user, "text_agentic");

    const workflowId = createWorkflowId(platform, { userId: user.chatId, channelId: user.chatId });

    const client = await createTemporalClient();
    return client.workflow.signalWithStart(agentWorkflow, {
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
