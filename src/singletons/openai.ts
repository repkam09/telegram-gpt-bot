import OpenAI from "openai";
import { Config } from "./config";
import { HennosGroup } from "./group";
import { HennosUser } from "./user";

export class OpenAIWrapper {
    private static _instance: OpenAI;
    private static _limited_instance: OpenAI;
    private static _limited_instance_ollama: OpenAI;

    private static async personal(req?: HennosUser | HennosGroup): Promise<OpenAI | null> {
        if (!req) {
            return null;
        }

        const custom = await req.getOpenAIKey();
        if (!custom) {
            return null;
        }

        return new OpenAI({
            apiKey: custom,
        });
    }

    static async instance(req?: HennosUser | HennosGroup): Promise<OpenAI> {
        if (!OpenAIWrapper._instance) {
            OpenAIWrapper._instance = new OpenAI({
                apiKey: Config.OPENAI_API_KEY,
            });
        }

        const personal = await this.personal(req);
        return personal ?? OpenAIWrapper._instance;
    }

    public static async models(req?: HennosUser | HennosGroup): Promise<OpenAI.Models> {
        const instance = await OpenAIWrapper.instance(req);
        return instance.models;
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
                baseURL: `http://${Config.OLLAMA_LOCAL_HOST}:${Config.OLLAMA_LOCAL_PORT}/v1/`,
                apiKey: Config.OLLAMA_LOCAL_LLM // This is a dummy key, it's not used for local ollama
            });
        }
        return OpenAIWrapper._limited_instance_ollama;
    }
}