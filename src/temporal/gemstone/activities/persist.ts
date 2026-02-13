import { AgentResponseHandler } from "../../../response";

type BroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    message: string;
    name: "assistant";
}

export async function persistAgentMessage(input: BroadcastAgentInput) {
    return AgentResponseHandler.handle(input.workflowId, input.message);
}