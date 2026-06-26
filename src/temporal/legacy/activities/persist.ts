import { Context } from "@temporalio/activity";
import { AgentResponseHandler } from "../../../response";
import { Database } from "../../../database";
import { parseWorkflowId } from "../interface";

type LegacyBroadcastAgentInput = {
    message: string;
}

export async function persistLegacyAgentMessage(input: LegacyBroadcastAgentInput) {
    const workflowId = Context.current().info.workflowExecution!.workflowId;

    const flow = parseWorkflowId(workflowId);

    const db = Database.instance();
    await db.messages.create({
        data: {
            chatId: Number(flow.chatId),
            role: "assistant",
            content: input.message,
            from: -1
        }
    });
}

export async function broadcastLegacyAgentMessage(input: LegacyBroadcastAgentInput) {
    const workflowId = Context.current().info.workflowExecution!.workflowId;
    return AgentResponseHandler.handleMessage(workflowId, input.message);
}

type LegacyBroadcastUserInput = {
    message: string;
    name: string;
}

export async function persistLegacyUserMessage(input: LegacyBroadcastUserInput) {
    const workflowId = Context.current().info.workflowExecution!.workflowId;

    const flow = parseWorkflowId(workflowId);

    const db = Database.instance();
    await db.messages.create({
        data: {
            chatId: Number(flow.chatId),
            role: "user",
            content: input.message,
            from: Number(flow.chatId)
        }
    });
}