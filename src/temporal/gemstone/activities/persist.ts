import { AgentResponseHandler } from "../../../response";

type GemstoneBroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    message: string;
    name: "assistant";
}

export async function persistGemstoneAgentMessage(input: GemstoneBroadcastAgentInput) {
    return AgentResponseHandler.handle(input.workflowId, input.message);
}