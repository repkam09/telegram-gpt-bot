import OpenAI from "openai";
import { HennosAnonUser, HennosUser } from "../../../singletons/consumer";
import { Logger } from "../../../singletons/logger";
import { ApplicationFailure } from "@temporalio/workflow";
import { handlePrivateMessage } from "../../../handlers/text/private";
import { Config } from "../../../singletons/config";

export * from "./openai";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export async function fetchUserHistory(chatId: number): Promise<Message[]> {
    const user = await getHennosUser(chatId);

    const messages: Message[] = [];
    const history = await user.getChatContext(50);

    for (const item of history) {
        if (item.type === "text") {
            messages.push({
                role: item.role === "user" ? "user" : "assistant",
                content: item.content
            });
        }
    }

    return messages;
}

export async function handleUserMessage(chatId: number, message: string): Promise<string> {
    const user = await getHennosUser(chatId);

    const result = await handlePrivateMessage(user, message);
    if (result.__type === "string") {
        return result.payload;
    }

    return JSON.stringify(result);
}

export async function fetchHennosUser(supabaseId: string): Promise<number> {
    Logger.info(`Fetching Hennos user for supabaseId ${supabaseId}`);
    return Config.TELEGRAM_BOT_ADMIN;
}

async function getHennosUser(chatId: number): Promise<HennosUser> {
    if (!chatId) {
        throw ApplicationFailure.nonRetryable("Invalid chatId", "InvalidChatId");
    }

    if (chatId === -1) {
        throw ApplicationFailure.nonRetryable("Invalid chatId", "DefaultInvalidChatId");
    }

    Logger.info(`Fetching HennosUser for chatId ${chatId}`);
    const user = await HennosUser.exists(chatId);
    if (!user) {
        throw ApplicationFailure.nonRetryable("User not found", "UserNotFound");
    }

    return user;
}


type MessageLite = {
    role: "user" | "assistant" | "system";
    content: string;
};

export async function hennosLiteChat(messages: MessageLite[]): Promise<MessageLite> {
    const hennosUser = await HennosAnonUser();

    const response = await handlePrivateMessage(hennosUser, messages.filter(m => m.role === "user").map(m => m.content).join("\n"));
    if (response.__type === "string") {
        return { role: "assistant", content: response.payload };
    }

    return { role: "assistant", content: JSON.stringify(response) };
}
