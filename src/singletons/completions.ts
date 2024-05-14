import OpenAI from "openai";
import { Config } from "./config";
import { Logger } from "./logger";
import { OpenAIWrapper } from "./openai";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";
import {
    process_tool_calls
} from "./tools";
import { WebSearch } from "../tools/websearch";

export async function processChatCompletionLocal(req: HennosUser | HennosGroup, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: Config.OLLAMA_LOCAL_LLM,
        messages: prompt,
        stream: false
    };

    try {
        Logger.info(req, `createChatCompletion Ollama Start (${Config.OLLAMA_LOCAL_LLM})`);

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

async function toolCallsApplicable(req: HennosUser | HennosGroup, message: OpenAI.Chat.Completions.ChatCompletionMessageParam): Promise<string[] | false> {
    if (!req.allowFunctionCalling()) {
        return false;
    }

    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: Config.OPENAI_API_LIMITED_LLM,
        messages: [
            {
                role: "system",
                content: "You are a helpful chat asistant that answers questions and provides information."
            },
            {
                role: "system",
                content: "Use any tools and functions available to you to provide the best possible answer."
            },
            message
        ],
        stream: false,
        tool_choice: "auto",
        tools: [
            WebSearch.definition
        ]
    };

    try {
        Logger.info(req, `toolCallsApplicable Start (${Config.OPENAI_API_LIMITED_LLM})`);

        const response = await OpenAIWrapper.limited_instance().chat.completions.create(options);

        if (!response || !response.choices) {
            throw new Error("Unexpected toolCallsApplicable Result: Bad Response Data Choices");
        }

        const called_tools: Set<string> = new Set();
        for (const choice of response.choices) {
            if (choice.message && choice.message.tool_calls) {
                for (const tool_call of choice.message.tool_calls) {
                    if (tool_call.function) {
                        called_tools.add(tool_call.function.name);
                    }
                }
            }
        }

        if (called_tools.size > 0) {
            const tools = Array.from(called_tools);
            Logger.info(req, `toolCallsApplicable End: ${tools.join(", ")}`);
            return tools;
        }

        Logger.info(req, "toolCallsApplicable End");
        return false;
    } catch (err) {
        const error = err as Error;
        Logger.error(req, "toolCallsApplicable Error:", error.message, error.stack, options);
        return false;
    }
}


export async function processChatCompletionLimited(user: HennosUser, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        return processChatCompletionLocal(user, prompt);
    }

    const options: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: Config.OPENAI_API_LIMITED_LLM,
        messages: prompt,
        stream: false
    };

    try {
        Logger.info(user, `createChatCompletion Limited Start (${Config.OPENAI_API_LIMITED_LLM})`);

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
        stream: false
    };

    if (req.allowFunctionCalling()) {
        const tool_calls = await toolCallsApplicable(req, prompt[prompt.length - 1]);
        if (tool_calls) {
            options.tool_choice = "auto";
            options.tools = [
                WebSearch.definition
            ];
        }
    }

    Logger.info(req, `createChatCompletion Start (${Config.OPENAI_API_LLM})`);

    const instance = await OpenAIWrapper.instance(req);
    const response = await instance.chat.completions.create(options);

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
}
