import OpenAI from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAIWrapper } from "../../singletons/openai";
import { OllamaWrapper } from "../../singletons/ollama";
import { BotInstance } from "../../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";
import { sleep } from "../../utils";

export const NotWhitelistedMessage = "Sorry, you have not been whitelisted to use this feature. This bot is limited access and invite only.";

export async function processChatCompletionLocal(chatId: number, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    Logger.info("ChatId", chatId, "createChatCompletion Local Start");

    const result = await OllamaWrapper.chat(chatId, messages);

    Logger.info("ChatId", chatId, "createChatCompletion Local End");

    return result;
}

export async function processChatCompletionLimited(chatId: number, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        await sleep(5000);
        return "example string in development mode, free tier response";
    }

    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: "gpt-3.5-turbo",
        messages: messages,
        stream: false
    };

    try {
        Logger.info("ChatId", chatId, "createChatCompletion Free Start");

        const response = await OpenAIWrapper.free_instance().chat.completions.create(options);

        Logger.info("ChatId", chatId, "createChatCompletion Free End");

        if (!response || !response.choices) {
            throw new Error("Unexpected createChatCompletion Free Result: Bad Response Data Choices");
        }

        const { message } = response.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Free Result: Bad Message Content Role");
        }

        if (message.content) {
            return message.content;
        }
        throw new Error("Unexpected createChatCompletion Free Result: Bad Message Format");
    } catch (err) {
        const error = err as Error;
        Logger.error("ChatId", chatId, "CreateChatCompletion Free Error:", error.message, error.stack, options);
        return "Sorry, I was unable to process your message at this time. ";
    }
}

export async function processChatCompletion(chatId: number, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        await sleep(5000);
        return "example string in development mode";
    }

    const model = Config.OPENAI_API_LLM;
    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: model,
        messages: messages,
        stream: false
    };

    try {
        Logger.info("ChatId", chatId, "createChatCompletion Start");

        const response = await OpenAIWrapper.instance().chat.completions.create(options);

        Logger.info("ChatId", chatId, "createChatCompletion End");

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

export async function updateChatContext(chatId: number, role: "user" | "assistant" | "system", content: string): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    Logger.debug(`${chatId} ${role} ${content}`);

    if (!await ChatMemory.hasContext(chatId)) {
        Logger.debug("updateChatContext Creating a new context");
        await ChatMemory.setContext(chatId, []);
    }

    const currentChatContext = await ChatMemory.getContext(chatId);

    if (currentChatContext.length > Config.HENNOS_MAX_MESSAGE_MEMORY) {
        Logger.debug("updateChatContext Shifting old message context");

        // Remove the oldest user message from memory
        currentChatContext.shift();
        // Remove the oldest assistant message from memory
        currentChatContext.shift();
    }

    currentChatContext.push({ role, content });
    await ChatMemory.setContext(chatId, currentChatContext);

    Logger.debug("updateChatContext Finished updating context");
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

export async function processFreeUserTextInput(chatId: number, text: string): Promise<string> {
    return text;
}

export async function moderateFreeUserTextInput(chatId: number, text: string): Promise<boolean> {
    try {
        const response = await OpenAIWrapper.instance().moderations.create({
            input: text
        });

        if (!response.results) {
            return false;
        }

        if (!response.results[0]) {
            return false;
        }

        return response.results[0].flagged;
    } catch (err) {
        return false;
    }
}

export async function processUserImageInput(chatId: number, images: TelegramBot.PhotoSize[], caption?: string): Promise<string> {
    const url = await BotInstance.instance().getFileLink(getLargestImage(images).file_id);

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
            type: "text",
            text: caption ? caption : "Describe this image in as much detail as posible"
        },
        {
            type: "image_url",
            image_url: {
                detail: "low",
                url
            }
        }
    ];

    const response = await OpenAIWrapper.instance().chat.completions.create({
        model: "gpt-4-vision-preview",
        max_tokens: 2000,
        messages: [
            {
                role: "user",
                content
            },
        ],
    });

    return response.choices[0].message.content || "No information available about this image";
}

function getLargestImage(images: TelegramBot.PhotoSize[]): TelegramBot.PhotoSize {
    return images.reduce((max, obj) => {
        return (obj.width * obj.height > max.width * max.height) ? obj : max;
    });
}