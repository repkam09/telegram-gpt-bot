import { ChatCompletionFunctions, ChatCompletionRequestMessage, ChatCompletionRequestMessageFunctionCall, ChatCompletionRequestMessageRoleEnum, CreateChatCompletionRequest, CreateImageRequest } from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAI } from "../../singletons/openai";
import { getVideoInfo } from "../../providers/youtube";

function buildFunctionsArray(): ChatCompletionFunctions[] {
    return [
        {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA"
                    },
                    "unit": {
                        "type": "string",
                        "enum": [
                            "celsius",
                            "fahrenheit"
                        ]
                    }
                },
                "required": [
                    "location"
                ]
            }
        },
        {
            "name": "generate_image",
            "description": "Generate an image based on the users input",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The prompt to feed into DALL-E"
                    }
                },
                "required": [
                    "prompt"
                ]
            }
        }
    ];
}

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
            options.function_call ="auto";
            options.functions =buildFunctionsArray();
        }

        const response = await OpenAI.instance().createChatCompletion(options);

        if (!response || !response.data || !response.data.choices) {
            throw new Error("Unexpected createChatCompletion Result: Bad Response Data Choices");
        }

        const { message } = response.data.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Result: Bad Message Content Role");
        }

        Logger.debug(JSON.stringify(message));

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
        Logger.error("ChatId", chatId, "CreateChatCompletion Error:", error.message, error.stack, error);
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
        Logger.error("ChatId", chatId, "createImage", options, "Error:", (err as Error).message, (err as Error).stack);
        return undefined;
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

export async function getChatContext(chatId: number): Promise<ChatCompletionRequestMessage[]> {
    const currentChatContext = await ChatMemory.getContext(chatId);
    return currentChatContext;
}

export function isAdmin(chatId: number): boolean {
    return Config.TELEGRAM_BOT_ADMIN === chatId;
}

export async function processUserTextInput(chatId: number, text: string): Promise<string> {
    try {
        text = text.trim();

        if (Config.GOOGLE_API_KEY) {
            const youtube = match(text, [
                new RegExp(/^https:\/\/youtu.be\/(.*?)$/),
                new RegExp(/^https:\/\/www.youtube.com\/watch\?v=(.*?)$/)
            ]);

            if (youtube) {
                return getVideoInfo(chatId, youtube[1]);
            }
        }
    } catch (err) {
        return text;
    }
    return text;
}

function match(text: string, regex: RegExp | RegExp[]): RegExpExecArray | null {
    if (!Array.isArray(regex)) {
        return regex.exec(text);
    }

    for (let i = 0; i < regex.length - 1; i++) {
        const match = regex[i].exec(text);
        if (match) {
            return match;
        }
    }
    return null;
}