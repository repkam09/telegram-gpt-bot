import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAI } from "../../singletons/openai";

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
