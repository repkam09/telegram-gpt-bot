import { AgentResponseHandler } from "../../../response";

type LegacyBroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    message: string;
    name: "assistant";
}

export async function persistLegacyAgentMessage(input: LegacyBroadcastAgentInput) {
    return AgentResponseHandler.handle(input.workflowId, input.message);
}