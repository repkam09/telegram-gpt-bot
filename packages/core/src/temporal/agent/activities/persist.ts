import { Database } from "../../../database";
import { LifeforceWebhook } from "../../../webhook";

export type BroadcastInput = BroadcastUserInput | BroadcastAgentInput;

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
    await updateWorkflowMessageDatabase(input);
}

export async function persistAgentMessage(input: BroadcastAgentInput) {
    await Promise.all([
        updateWorkflowMessageDatabase(input),
        LifeforceWebhook.broadcast(input)
    ]);
}

async function updateWorkflowMessageDatabase(input: BroadcastUserInput | BroadcastAgentInput): Promise<void> {
    const db = Database.instance();
    await db.workflowMessage.create({
        data: {
            workflowId: input.workflowId,
            content: input.message,
            type: "text",
            name: input.name ? input.name : "assistant",
            role: input.type === "user-message" ? "user" : "assistant",
            datetime: new Date(),
        }
    });
}