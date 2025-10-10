import { proxyActivities } from "@temporalio/workflow";
import * as activities from "../../temporal/activities";

type MessageLite = {
    role: "user" | "assistant" | "system";
    content: string;
};
// Define the activities and options
const { hennosLiteChat } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minute",
});

type HennosLiteChatInput = {
    requestId: string;
    messages: MessageLite[];
}

export async function hennosLiteChatWorkflow(input: HennosLiteChatInput): Promise<MessageLite> {
    const { messages } = input;
    const response = await hennosLiteChat(messages);
    return response;
}
