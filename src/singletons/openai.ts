import { Config } from "./config";
import OpenAI from "openai";

export class OpenAIWrapper {
    private static _instance: OpenAI;

    public static instance(): OpenAI {
        if (!OpenAIWrapper._instance) {
            OpenAIWrapper._instance = new OpenAI({
                apiKey: Config.OPENAI_API_KEY,
            });
        }
        return OpenAIWrapper._instance;
    }
}