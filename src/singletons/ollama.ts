import OpenAI from "openai";
import axios from "axios";
import { Config } from "./config";
import { Logger } from "./logger";

type OllamaResult = {
    model: string,
    response: string,
    context: number[],
    done: true
}

export class OllamaWrapper {
    static async chat(chatId: number, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
        try {
            if (!Config.OLLAMA_LLM) {
                throw new Error("OLLAMA_LLM is not configured");
            }
            
            const converted = messages.map((message) => {
                if (message.role === "system") {
                    return message.content as string;
                }
                return `${message.role}: ${message.content}`;
            });

            const result = await axios<OllamaResult>("http://localhost:11434/api/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    model: Config.OLLAMA_LLM,
                    stream: false,
                    prompt: converted.join("\n")
                }
            });

            const text = result.data.response;

            return text;
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error("ChatId", chatId, "CreateChatCompletion Local Error:", error.message, error.stack);
            return "Sorry, I was unable to process your message";        }
    }
}