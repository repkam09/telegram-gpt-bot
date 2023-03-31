import { Configuration, OpenAIApi } from "openai";

const MODEL_FOR_KEY_MAP = new Map();

export class ChatCompletionHandler {
    constructor(logger) {
        const configuration = new Configuration({
            organization: process.env.OPENAI_API_ORG,
            apiKey: process.env.OPENAI_API_KEY,
        });

        this.logger = logger;
        this.openai = new OpenAIApi(configuration);
        this.defaultModel = process.env.OPENAI_API_LLM || 'gpt-3.5-turbo'
    }

    async getModels() {
        const models = await this.openai.listModels()
        const knownModels = models.data.data.map((model) => model.id)
        return knownModels
    }

    getModelForKey(key) {
        if (MODEL_FOR_KEY_MAP.has(key)) {
            return MODEL_FOR_KEY_MAP.get(key)
        }

        return this.defaultModel
    }

    setModelForKey(key, model) {
        MODEL_FOR_KEY_MAP.set(key, model)
    }

    async chat(messages) {
        let response = null;

        try {
            response = await this.openai.createChatCompletion({
                model: model,
                messages: messages,
            });
        } catch (err) {
            this.logger.debug("Error while running chatCompletion: ", err.message, err)
        }

        if (response && response.data && response.data.choices) {
            if (response.data.choices[0] && response.data.choices[0].message) {
                return response.data.choices[0].message
            }
        }

        return `Sorry, I encountered an error while handling your chat message. Try again shortly!`
    }


}