import { Configuration, ListModelsResponse, Model, OpenAIApi } from "openai";
import { Config } from "./config";

export class OpenAI {
    private static _instance: OpenAIApi;
    private static _models: ListModelsResponse;

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

    public static async models(): Promise<ListModelsResponse> {
        if (!OpenAI._models) {
            const temp = await OpenAI._instance.listModels();
            OpenAI._models = temp.data;
        }

        return OpenAI._models;
    }

    public static async model(name: string): Promise<Model> {
        const temp = await OpenAI._instance.retrieveModel(name);
        return temp.data;
    }
}