import OpenAI from "openai";
import { Config } from "./config";

export class OpenAIWrapper {
    private static _instance: OpenAI;
    private static _free_instance: OpenAI;
    private static _models: OpenAI.Models;

    static instance(): OpenAI {
        if (!OpenAIWrapper._instance) {
            OpenAIWrapper._instance = new OpenAI({
                organization: Config.OPENAI_API_ORG,
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

    public static free_instance(): OpenAI {
        if (!OpenAIWrapper._free_instance) {
            OpenAIWrapper._free_instance = new OpenAI({
                organization: Config.OPENAI_API_ORG_FREE,
                apiKey: Config.OPENAI_API_KEY_FREE
            });
        }
        return OpenAIWrapper._free_instance;
    }
}