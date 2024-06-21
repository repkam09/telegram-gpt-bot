import { ListResponse, Message, Ollama } from "ollama";
import { Config } from "./config";
import { HennosGroup } from "./group";
import { Logger } from "./logger";
import { HennosUser } from "./user";
import { getSizedChatContext } from "./context";

type HennosConsumer = HennosUser | HennosGroup

export class HennosOllamaProvider {
    private static _instance: Ollama;

    private static instance(): Ollama {
        if (!HennosOllamaProvider._instance) {
            HennosOllamaProvider._instance = new Ollama({
                host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
            });
        }
        return HennosOllamaProvider._instance;
    }

    public static async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string> {
        Logger.info(req, `Ollama Completion Start (${Config.OLLAMA_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.OLLAMA_LLM.CTX);

        try {
            const prompt = system.concat(chat);

            const response = await HennosOllamaProvider.instance().chat({
                stream: false,
                model: Config.OLLAMA_LLM.MODEL,
                messages: prompt
            });

            Logger.info(req, `Ollama Completion Success, Resulted in ${response.eval_count} output tokens`);
            return response.message.content;
        } catch (err: unknown) {
            Logger.info(req, "Ollama Completion Error: ", err);
            throw err;
        }
    }

    public static async vision(req: HennosConsumer, prompt: Message, local: string, mime: string): Promise<string> {
        Logger.info(req, `Ollama Vision Completion Start (${Config.OLLAMA_LLM_VISION.MODEL})`);
        try {
            const response = await HennosOllamaProvider.instance().chat({
                stream: false,
                model: Config.OLLAMA_LLM_VISION.MODEL,
                messages: [{
                    role: prompt.role,
                    content: prompt.content,
                    images: [local]
                }]
            });

            Logger.info(req, "Ollama Vision Completion Success");
            return response.message.content;
        } catch (err: unknown) {
            Logger.info(req, "Ollama Vision Completion Error: ", err);
            throw err;
        }
    }

    public static async models(): Promise<ListResponse> {
        return HennosOllamaProvider.instance().list();
    }

    public static async status(): Promise<ListResponse> {
        return HennosOllamaProvider.instance().ps();
    }
}