import OpenAI from "openai";
import { Config } from "./config";
import { Logger } from "./logger";
import { OpenAIWrapper } from "./openai";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";
import {
    duck_duck_go_search_tool,
    process_tool_calls
} from "./tools";

export async function processChatCompletionLocal(req: HennosUser | HennosGroup, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: Config.OLLAMA_LLM,
        messages: prompt,
        stream: false
    };

    try {
        Logger.info(req, `createChatCompletion Ollama Start (${Config.OLLAMA_LLM})`);

        const response = await OpenAIWrapper.limited_instance_ollama().chat.completions.create(options);

        Logger.info(req, "createChatCompletion Ollama End");

        if (!response || !response.choices) {
            throw new Error("Unexpected createChatCompletion Ollama Result: Bad Response Data Choices");
        }

        const { message } = response.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Ollama Result: Bad Message Content Role");
        }

        if (message.content) {
            return message.content;
        }
        throw new Error("Unexpected createChatCompletion Ollama Result: Bad Message Format");
    } catch (err) {
        const error = err as Error;
        Logger.error(req, "CreateChatCompletion Ollama Error:", error.message, error.stack, options);
        return "Sorry, I was unable to process your message at this time. ";
    }
}

export async function processChatCompletionLimited(user: HennosUser, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        return processChatCompletionLocal(user, prompt);
    }

    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: "gpt-3.5-turbo",
        messages: prompt,
        stream: false
    };

    try {
        Logger.info(user, "createChatCompletion Limited Start (gpt-3.5-turbo)");

        const response = await OpenAIWrapper.limited_instance().chat.completions.create(options);

        Logger.info(user, "createChatCompletion Limited End");

        if (!response || !response.choices) {
            throw new Error("Unexpected createChatCompletion Limited Result: Bad Response Data Choices");
        }

        const { message } = response.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Limited Result: Bad Message Content Role");
        }

        if (message.content) {
            return message.content;
        }
        throw new Error("Unexpected createChatCompletion Limited Result: Bad Message Format");
    } catch (err) {
        const error = err as Error;
        Logger.error(user, "CreateChatCompletion Limited Error:", error.message, error.stack, options);
        return "Sorry, I was unable to process your message at this time. ";
    }
}

export async function processChatCompletion(req: HennosUser | HennosGroup, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[], depth = 0): Promise<string> {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        return processChatCompletionLocal(req, prompt);
    }

    const model = Config.OPENAI_API_LLM;
    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: model,
        messages: prompt,
        stream: false,
        tool_choice: "none"
    };

    if (req.allowFunctionCalling()) {
        options.tool_choice = "auto";
        options.tools = [
            duck_duck_go_search_tool
        ];
    }

    try {
        Logger.info(req, `createChatCompletion Start (${Config.OPENAI_API_LLM})`);

        const response = await OpenAIWrapper.instance().chat.completions.create(options);

        Logger.info(req, "createChatCompletion End");

        if (!response || !response.choices) {
            throw new Error("Unexpected createChatCompletion Result: Bad Response Data Choices");
        }

        const { message } = response.choices[0];
        if (!message || !message.role) {
            throw new Error("Unexpected createChatCompletion Result: Bad Message Content Role");
        }

        if (message.tool_calls) {
            if (depth > 3) throw new Error("processChatCompletion recursion depth exceeded");

            const tool_messages = await process_tool_calls(req, message.tool_calls);
            return processChatCompletion(req, [
                ...prompt,
                message,
                ...tool_messages
            ], depth + 1);
        }

        if (message.content) {
            return message.content;
        }

        throw new Error("Unexpected createChatCompletion Result: Bad Message Format");
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(req, "CreateChatCompletion Error:", error.message, error.stack, options);
        return "Sorry, I was unable to process your message";
    }
}
