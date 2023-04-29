import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAI } from "../../singletons/openai";
import { getVideoInfo } from "../../providers/youtube";

export async function processChatCompletion(chatId: number, messages: ChatCompletionRequestMessage[]): Promise<string> {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        return "HENNOS DEVELOPMENT MODE";
    }

    const model = await ChatMemory.getLLM(chatId);
    try {
        const response = await OpenAI.instance().createChatCompletion({
            model: model,
            messages: messages,
        });

        if (!response || !response.data || !response.data.choices) {
            throw new Error("Unexpected createChatCompletion Result: Bad Response Data Choices");
        }

        const { message } = response.data.choices[0];
        if (!message || !message.content || !message.role) {
            throw new Error("Unexpected createChatCompletion Result: Bad Message Content Role");
        }

        return message.content;
    } catch (err: unknown) {
        Logger.error("ChatId", chatId, "CreateChatCompletion Error:", (err as Error).message, "\n", err as Error);
        return "Sorry, I was unable to process your message";
    }
}

export async function updateChatContext(chatId: number, role: ChatCompletionRequestMessageRoleEnum, content: string): Promise<ChatCompletionRequestMessage[]> {
    if (!await ChatMemory.hasContext(chatId)) {
        await ChatMemory.setContext(chatId, []);
    }

    const currentChatContext = await ChatMemory.getContext(chatId);

    if (currentChatContext.length > Config.HENNOS_MAX_MESSAGE_MEMORY) {
        // Remove the oldest user message from memory
        currentChatContext.shift();
        // Remove the oldest assistant message from memory
        currentChatContext.shift();
    }

    currentChatContext.push({ role, content });
    await ChatMemory.setContext(chatId, currentChatContext);
    return currentChatContext;
}


export function isAdmin(chatId: number): boolean {
    return Config.TELEGRAM_BOT_ADMIN === chatId;
}

export async function processUserTextInput(_chatId: number, text: string): Promise<string> {
    try {
        text = text.trim();

        if (Config.GOOGLE_API_KEY) {
            const youtube = match(text, [
                new RegExp(/^https:\/\/youtu.be\/(.*?)$/),
                new RegExp(/^https:\/\/www.youtube.com\/watch\?v=(.*?)$/)
            ]);

            if (youtube) {
                return getVideoInfo(youtube[1]);
            }
        }
    } catch (err) {
        return text;
    }
    return text;
}

function match(text: string, regex: RegExp[]): RegExpExecArray | null {
    for (let i = 0; i < regex.length - 1; i++) {
        const match = regex[i].exec(text);
        if (match) {
            return match;
        }
    }
    return null;
}