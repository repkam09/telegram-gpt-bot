import OpenAI from "openai";
import { Config } from "./config";
import { Logger } from "./logger";
import { OllamaWrapper } from "./ollama";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";
import { Message } from "ollama";

export async function processChatCompletionLimited(user: HennosUser, prompt: Message[]): Promise<string> {
    const options = {
        options: {
            num_ctx: Config.OLLAMA_LLM.CTX
        },
        model: Config.OLLAMA_LLM.MODEL,
        messages: prompt
    };

    try {
        Logger.info(user, `createChatCompletion Limited Start (${Config.OLLAMA_LLM.MODEL})`);

        const response = await OllamaWrapper.instance().chat(options);

        Logger.info(user, "createChatCompletion Limited End");

        if (!response.message || !response.message.role) {
            throw new Error("Unexpected createChatCompletion Limited Result: Bad Message Content Role");
        }

        if (response.message.content) {
            return response.message.content;
        }
        throw new Error("Unexpected createChatCompletion Limited Result: Bad Message Format");
    } catch (err) {
        const error = err as Error;
        Logger.error(user, "CreateChatCompletion Limited Error:", error.message, error.stack, options);
        return "Sorry, I was unable to process your message at this time. ";
    }
}

export async function processChatCompletion(req: HennosUser | HennosGroup, prompt: Message[], depth = 0): Promise<string> {
    const options = {
        options: {
            num_ctx: Config.OLLAMA_LLM.CTX
        },
        model: Config.OLLAMA_LLM.MODEL,
        messages: prompt
    };

    Logger.info(req, `createChatCompletion Start (${Config.OLLAMA_LLM.MODEL})`);

    const response = await OllamaWrapper.instance().chat(options);

    Logger.info(req, "createChatCompletion End");

    if (!response.message || !response.message.role) {
        throw new Error("Unexpected createChatCompletion Result: Bad Message Content Role");
    }

    if (response.message.content) {
        return response.message.content;
    }

    throw new Error("Unexpected createChatCompletion Result: Bad Message Format");
}
