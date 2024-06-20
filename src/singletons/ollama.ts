import { ListResponse, Ollama } from "ollama";
import { Config } from "./config";

export class OllamaWrapper {
    private static _instance: Ollama;

    public static instance(): Ollama {
        if (!OllamaWrapper._instance) {
            OllamaWrapper._instance = new Ollama({
                host: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}/v1/`
            });
        }
        return OllamaWrapper._instance;
    }

    public static async models(): Promise<ListResponse> {
        return OllamaWrapper.instance().list();
    }

    public static async status(): Promise<any> {
        return OllamaWrapper.instance().ps();
    }
}