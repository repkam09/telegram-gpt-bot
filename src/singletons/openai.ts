import { Configuration, OpenAIApi } from "openai";
import { Config } from "./config";

export class OpenAI { 
    static _instance: OpenAIApi;

    static instance(): OpenAIApi {
        if (!OpenAI._instance) {
            const configuration = new Configuration({
                organization: Config.OPENAI_API_ORG,
                apiKey: Config.OPENAI_API_KEY,
            });

            OpenAI._instance = new OpenAIApi(configuration);
        }

        return OpenAI._instance;
    }
}