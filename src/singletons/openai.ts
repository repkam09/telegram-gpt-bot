import OpenAI from "openai";
import { Config } from "./config";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export class OpenAIWrapper {
    private static _instance: OpenAI;
    private static _limited_instance: OpenAI;
    private static _limited_instance_ollama: OpenAI;
    private static _models: OpenAI.Models;

    static instance(): OpenAI {
        if (!OpenAIWrapper._instance) {
            OpenAIWrapper._instance = new OpenAI({
                apiKey: Config.OPENAI_API_KEY,
            });
        }

        return OpenAIWrapper._instance;
    }

    public static async models(): Promise<OpenAI.Models> {
        if (!OpenAIWrapper._models) {
            const temp = await OpenAIWrapper._instance.models;
            OpenAIWrapper._models = temp;
        }

        return OpenAIWrapper._models;
    }

    public static limited_instance(): OpenAI {
        if (!OpenAIWrapper._limited_instance) {
            OpenAIWrapper._limited_instance = new OpenAI({
                apiKey: Config.OPENAI_API_KEY_LIMITED
            });
        }
        return OpenAIWrapper._limited_instance;
    }

    public static limited_instance_ollama(): OpenAI {
        if (!OpenAIWrapper._limited_instance_ollama) {
            OpenAIWrapper._limited_instance_ollama = new OpenAI({
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}/v1/`,
                apiKey: Config.TELEGRAM_BOT_KEY // This is a dummy key, it's not used for local ollama
            });
        }
        return OpenAIWrapper._limited_instance_ollama;
    }
}