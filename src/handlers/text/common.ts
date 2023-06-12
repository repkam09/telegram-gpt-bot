import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum, CreateCompletionRequest, CreateCompletionRequestPrompt, CreateImageRequest } from "openai";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { ChatMemory } from "../../singletons/memory";
import { OpenAI } from "../../singletons/openai";
import { getVideoInfo } from "../../providers/youtube";

export async function processChatCompletion(chatId: number, messages: ChatCompletionRequestMessage[]): Promise<string> {
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

export async function determineUserIntent(chatId: number, message: string): Promise<"TEXT" | "IMAGE"> {
    const context: CreateCompletionRequestPrompt = 
`You are a classifiation tool that determines what type of output a user wants based on their input. Respond with 'IMAGE' or 'TEXT'.

User: Create an image of a fish in space
Assistant: IMAGE
User: Draw a picture of a tree
Assistant: IMAGE
User: What is the capital of France?
Assistant: TEXT
User: Write an example of how to make a POST request in JavaScript
Assistant: TEXT
User: Create a dank meme
Assistant: IMAGE
User: Show me a cat
Assistant: IMAGE
User: Draw a picture of a cell phone
Assistant: IMAGE
User: What is Linux?
Assistant: TEXT
User: Can you create a picture of a dog?
Assistant: IMAGE
User: ${message}
Assistant:`;

    try {
        const options: CreateCompletionRequest = {
            model: "davinci",
            prompt: context,
            max_tokens: 2,
            best_of: 1,
            temperature: 1
        };

        const response = await OpenAI.instance().createCompletion(options);

        if (!response || !response.data || !response.data.choices) {
            throw new Error("Unexpected createChatCompletion Result: Bad Response Data Choices");
        }

        let { text } = response.data.choices[0];
        if (!text) {
            Logger.error("ChatId", chatId, "Unexpected createCompletion Result: Bad Message Content", "\n", "options:", JSON.stringify(options));
            return "TEXT";
        }

        text = text.trim();

        if (text === "IMAGE") {
            return text;
        }

        if (text === "TEXT") {
            return text;
        }

        Logger.error("ChatId", chatId, "Unexpected createCompletion Result: Bad Message Content", "\n", "options", JSON.stringify(options));
        return "TEXT";
    } catch (err: unknown) {
        Logger.error("ChatId", chatId, "CreateChatCompletion Error:", (err as Error).message, "\n", err as Error);
        return "TEXT";
    }

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