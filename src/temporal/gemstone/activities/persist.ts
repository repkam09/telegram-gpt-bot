import { AgentResponseHandler } from "../../../response";

type GemstoneBroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    message: string;
    name: "assistant";
}

export async function persistGemstoneAgentMessage(input: GemstoneBroadcastAgentInput) {
    return AgentResponseHandler.handleMessage(input.workflowId, input.message);
}