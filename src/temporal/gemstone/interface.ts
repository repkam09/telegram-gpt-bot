import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { gemstoneAgentWorkflow, gemstoneAgentWorkflowMessageSignal } from "./workflow";

export type PendingMessage = {
    author: string;
    message: string;
    date: string;
}

export type GemstoneAgentWorkflowInput = {
    continueAsNew?: {
        context: GemstoneAgentContext[];
        pending: PendingMessage[];
        userRequestedExit: boolean;
    };
};

export type GemstoneAgentContext = {
    role: "user" | "assistant" | "system";
    content: string;
};

export function createWorkflowId(platform: string, chatId: string): string {
    const payload = JSON.stringify({
        platform,
        chatId,
        type: "gemstone"
    });
    return payload;
}

export function parseWorkflowId(workflowId: string): { platform: string; chatId: string; type: "gemstone" } {
    return JSON.parse(workflowId);
}

export async function signalGemstoneWorkflowMessage(workflowId: string, author: string, message: string) {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(gemstoneAgentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: workflowId,
        args: [{}],
        signal: gemstoneAgentWorkflowMessageSignal,
        signalArgs: [message, author, new Date().toISOString()],
    });
}