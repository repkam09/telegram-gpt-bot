import OpenAI from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAIWrapper } from "../../singletons/openai";
import { BotInstance } from "../../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";

export async function processChatCompletion(chatId: number, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    const model = Config.OPENAI_API_LLM;
    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: model,
        messages: messages,
        stream: false
    };

    try {
        Logger.info("ChatId", chatId, "createChatCompletion Start");

        const response = await OpenAIWrapper.instance().chat.completions.create(options);

        if (!response || !response.choices) {
            throw new Error("Unexpected createChatCompletion Result: Bad Response Data Choices");
        }

        const { message } = response.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Result: Bad Message Content Role");
        }

        if (message.content) {
            return message.content;
        }

        throw new Error("Unexpected createChatCompletion Result: Bad Message Format");
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("ChatId", chatId, "CreateChatCompletion Error:", error.message, error.stack, options);
        return "Sorry, I was unable to process your message";
    }
}

export async function processImageGeneration(chatId: number, prompt: string): Promise<string | undefined> {
    const options: OpenAI.Images.ImageGenerateParams = {
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url"
    };
    try {
        Logger.info("ChatId", chatId, "createImage Start");
        Logger.debug(`createImage Options: ${JSON.stringify(options)}`);

        const response = await OpenAIWrapper.instance().images.generate(options);

        if (!response || !response.data || !response.data) {
            Logger.error("ChatId", chatId, "createImage returned invalid response shape, missing data");
            return undefined;
        }

        const { url } = response.data[0];
        if (!url) {
            Logger.error("ChatId", chatId, "createImage returned invalid response shape, missing url");
            return undefined;
        }

        return url;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("ChatId", chatId, "createImage", options, "Error:", error.message, error.stack);
        return undefined;
    }
}

export async function updateChatContextWithName(chatId: number, name: string, role: "user" | "assistant", content: string): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    Logger.debug(`${name} ${role} ${content}`);

    if (!await ChatMemory.hasContext(chatId)) {
        Logger.debug("updateChatContextWithName Creating a new context");
        await ChatMemory.setContext(chatId, []);
    }

    const currentChatContext = await ChatMemory.getContext(chatId);

    if (currentChatContext.length > Config.HENNOS_MAX_MESSAGE_MEMORY) {
        Logger.debug("updateChatContextWithName Shifting old message context");

        // Remove the oldest user message from memory
        currentChatContext.shift();
        // Remove the oldest assistant message from memory
        currentChatContext.shift();
    }

    currentChatContext.push({ role, content });
    await ChatMemory.setContext(chatId, currentChatContext);

    Logger.debug("updateChatContextWithName Finished updating context");
    return currentChatContext;
}

export async function getChatContext(chatId: number): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    const currentChatContext = await ChatMemory.getContext(chatId);
    return currentChatContext;
}

export function isAdmin(chatId: number): boolean {
    return Config.TELEGRAM_BOT_ADMIN === chatId;
}

export async function processUserTextInput(chatId: number, text: string): Promise<string> {
    return text;
}

export async function processUserImageInput(chatId: number, images: TelegramBot.PhotoSize[]): Promise<string> {
    return images.map((image) => {
        const url = BotInstance.instance().getFileLink(image.file_id);
        return JSON.stringify({
            type: "image_url",
            image_url: url
        });
    }).join("\n");
}