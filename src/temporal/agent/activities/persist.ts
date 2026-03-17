import { Database } from "../../../database";
import { AgentResponseHandler } from "../../../response";
import { persistMemoryEvent } from "../../memory/interface";
import { parseWorkflowId } from "../interface";

type BroadcastUserInput = {
    type: "user-message"
    workflowId: string;
    message: string;
    name: string;
}

type BroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    message: string;
    name: "assistant";
}

export async function persistUserMessage(input: BroadcastUserInput) {
    const info = parseWorkflowId(input.workflowId);
    await Promise.all([
        updateWorkflowMessageDatabase(input),
        persistMemoryEvent(input.workflowId, info.chatId, "user", input.message)
    ]);
}

export async function persistAgentMessage(input: BroadcastAgentInput) {
    const info = parseWorkflowId(input.workflowId);
    await Promise.all([
        updateWorkflowMessageDatabase(input),
        AgentResponseHandler.handleMessage(input.workflowId, input.message),
        persistMemoryEvent(input.workflowId, info.chatId, "assistant", input.message)
    ]);
}

async function updateWorkflowMessageDatabase(input: BroadcastUserInput | BroadcastAgentInput): Promise<void> {
    const db = Database.instance();
    await db.workflowMessage.create({
        data: {
            workflowId: input.workflowId,
            content: input.message,
            type: "text",
            userId: input.name ? input.name : "assistant",
            role: input.type === "user-message" ? "user" : "assistant",
            datetime: new Date(),
        }
    });
}