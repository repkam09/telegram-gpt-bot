import { UsageMetadata } from "@google/genai";
import { InternalCallbackHandler } from "../../../events/internal";
import { LifeforceBroadcast } from "../../../events/lifeforce";
import { HennosWorkflowUser } from "../../common/types";
import { Database } from "../../../../singletons/data/sqlite";

export type BroadcastInput = BroadcastUsageInput | BroadcastUserInput | BroadcastAgentInput;

type BroadcastUserInput = {
    type: "user-message"
    user: HennosWorkflowUser;
    workflowId: string;
    message: string;
}

type BroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    user: HennosWorkflowUser;
    message: string;
}

type BroadcastUsageInput = {
    type: "usage"
    workflowId: string;
    usage: UsageMetadata;
}

export async function broadcast(input: BroadcastInput): Promise<void> {
    switch (input.type) {
        case "user-message":
            // Using the user info, update the database with the message for long term storage
            await Promise.all([
                updateWorkflowMessageDatabase(input),
            ]);
            break;
        case "agent-message":
            // Using the user info, update the database with the message for long term storage
            await Promise.all([
                updateWorkflowMessageDatabase(input),
                LifeforceBroadcast.broadcast(input),
                InternalCallbackHandler.broadcast(input.workflowId, "message", input.message),
            ]);
            break;
        case "usage":
            InternalCallbackHandler.broadcast(input.workflowId, "usage", JSON.stringify(input.usage));
            break;
        default:
            console.error("Unknown broadcast input type:", (input as BroadcastInput).type);
    }
}

async function updateWorkflowMessageDatabase(input: BroadcastUserInput | BroadcastAgentInput): Promise<void> {
    const db = Database.instance();
    await db.workflowMessage.create({
        data: {
            workflowId: input.workflowId,
            content: input.message,
            type: "text",
            userId: input.user.userId.value,
            role: input.type === "user-message" ? "user" : "assistant",
            datetime: new Date(),
        }
    });
}