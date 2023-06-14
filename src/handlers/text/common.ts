import { ChatCompletionRequestMessage, ChatCompletionRequestMessageFunctionCall, ChatCompletionRequestMessageRoleEnum, CreateChatCompletionRequest, CreateImageRequest } from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAI } from "../../singletons/openai";
import { getVideoInfo } from "../../providers/youtube";
import { Functions } from "../../singletons/functions";

type ProcessChatCompletionResponse = ProcessChatCompletionTextResponse | ProcessChatCompletionFunctionResponse

type ProcessChatCompletionTextResponse = {
    type: "content",
    data: string
}

type ProcessChatCompletionFunctionResponse = {
    type: "function",
    data: ChatCompletionRequestMessageFunctionCall
}

type ProcessChatCompletionSettings = {
    functions: boolean
}
export async function processChatCompletion(chatId: number, messages: ChatCompletionRequestMessage[], settings: ProcessChatCompletionSettings): Promise<ProcessChatCompletionResponse> {
    const model = await ChatMemory.getLLM(chatId);
    try {

        const options: CreateChatCompletionRequest = {
            model: model,
            messages: messages
        };

        if (settings.functions) {
            options.function_call = "auto";
            options.functions = Functions.registered();
        }

        Logger.info("ChatId", chatId, "createChatCompletion Start");
        Logger.debug(`createChatCompletion Options: ${JSON.stringify(options)}`);

        const response = await OpenAI.instance().createChatCompletion(options);

        if (!response || !response.data || !response.data.choices) {
            throw new Error("Unexpected createChatCompletion Result: Bad Response Data Choices");
        }

        const { message } = response.data.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Result: Bad Message Content Role");
        }

        if (message.function_call) {
            return {
                type: "function",
                data: message.function_call
            };
        }

        if (message.content) {
            return {
                type: "content",
                data: message.content
            };
        }

        throw new Error("Unexpected createChatCompletion Result: Bad Message Format");
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("ChatId", chatId, "CreateChatCompletion Error:", error.message, error.stack);
        return {
            type: "content",
            data: "Sorry, I was unable to process your message"
        };
    }
}

export async function processImageGeneration(chatId: number, prompt: string): Promise<string | undefined> {
    const options: CreateImageRequest= {
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url"
    };
    try {
        Logger.info("ChatId", chatId, "createImage Start");
        Logger.debug(`createImage Options: ${JSON.stringify(options)}`);

        const response = await OpenAI.instance().createImage(options);

        if (!response || !response.data || !response.data.data) {
            Logger.error("ChatId", chatId, "createImage returned invalid response shape, missing data");
            return undefined;
        }

        const { url } = response.data.data[0];
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

export async function updateChatContextWithName(chatId: number, name: string, role: ChatCompletionRequestMessageRoleEnum, content: string): Promise<ChatCompletionRequestMessage[]> {
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

    currentChatContext.push({ role, content, name });
    await ChatMemory.setContext(chatId, currentChatContext);

    Logger.debug("updateChatContext Finished updating context");
    return currentChatContext;
}


export async function updateChatContext(chatId: number, role: ChatCompletionRequestMessageRoleEnum, content: string): Promise<ChatCompletionRequestMessage[]> {
    return updateChatContextWithName(chatId, chatId.toString(), role, content);
}

export async function getChatContext(chatId: number): Promise<ChatCompletionRequestMessage[]> {
    const currentChatContext = await ChatMemory.getContext(chatId);
    return currentChatContext;
}

export function isAdmin(chatId: number): boolean {
    return Config.TELEGRAM_BOT_ADMIN === chatId;
}

export async function processUserTextInput(chatId: number, text: string): Promise<string> {
    return text;
}