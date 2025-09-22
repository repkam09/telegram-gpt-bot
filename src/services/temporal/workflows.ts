import { proxyActivities } from "@temporalio/workflow";
import * as activities from "../temporal/activities";
import OpenAI from "openai";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type HennosChatInput = {
    userId: string;
    message: string;
}

// Define the activities and options
const { fetchUserHistory, handleUserMessage, fetchHennosUser, hennosLiteChat } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minute",
});

export async function hennosChat(input: HennosChatInput): Promise<string> {
    const { userId, message } = input;

    const chatId = await fetchHennosUser(userId);
    return handleUserMessage(chatId, message);
}

export async function hennosFetchHistory(supabaseId: string): Promise<Message[]> {
    const chatId = await fetchHennosUser(supabaseId);
    const history = await fetchUserHistory(chatId);
    return history;
}


type MessageLite = {
    role: "user" | "assistant" | "system";
    content: string;
};

type HennosLiteChatInput = {
    requestId: string;
    messages: MessageLite[];
}

export async function hennosLiteChatWorkflow(input: HennosLiteChatInput): Promise<MessageLite> {
    const { messages } = input;
    const response = await hennosLiteChat(messages);
    return response;
}


// Export the names of the workflows to match the Client configuration
exports["hennos-fetch-history"] = hennosFetchHistory;
exports["hennos-chat"] = hennosChat;
exports["llm-chat"] = hennosLiteChatWorkflow;