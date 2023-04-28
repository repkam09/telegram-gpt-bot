// @ts-check

import { Configuration, OpenAIApi } from "openai";
import { Config } from "./config";

export class OpenAI { 
    static _instance;
    static _models;

    /**
     * 
     * @returns {OpenAIApi} OpenAI API Instance
     */
    static instance() {
        if (!OpenAI._instance) {
            const configuration = new Configuration({
                organization: Config.OPENAI_API_ORG,
                apiKey: Config.OPENAI_API_KEY,
            });

            OpenAI._instance = new OpenAIApi(configuration);
        }

        return OpenAI._instance;
    }

    /**
     * 
     * @returns {Promise<string[]>} OpenAI Model names
     */
    static async models() {
        if (!OpenAI._models) {
            const models = await OpenAI.instance().listModels();
            OpenAI._models = models.data.data.map((model) => model.id);
        }

        return OpenAI._models;
    }
}