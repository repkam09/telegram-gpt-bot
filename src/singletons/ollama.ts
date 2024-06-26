import { Message, Ollama } from "ollama";
import ffmpeg from "fluent-ffmpeg";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosUser } from "./user";

// type WhisperResult = {
//     start: string,
//     end: string,
//     speech: string
// }[]

export class HennosOllamaSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosOllamaSingleton._instance) {
            HennosOllamaSingleton._instance = new HennosOllamaProvider();
        }
        return HennosOllamaSingleton._instance;
    }
}

class HennosOllamaProvider extends HennosBaseProvider {
    private ollama: Ollama;

    constructor() {
        super();

        this.ollama = new Ollama({
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        });
    }

    public async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string> {
        Logger.info(req, `Ollama Completion Start (${Config.OLLAMA_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.OLLAMA_LLM.CTX);

        try {
            const prompt = system.concat(chat);

            const response = await this.ollama.chat({
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

    public async vision(req: HennosConsumer, prompt: Message, local: string, mime: string): Promise<string> {
        Logger.info(req, `Ollama Vision Completion Start (${Config.OLLAMA_LLM_VISION.MODEL})`);
        try {
            const response = await this.ollama.chat({
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

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Ollama Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, path: string): Promise<string> {
        Logger.info(req, "Ollama Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, path);
    }

    // public async experimental_local_transcription(req: HennosConsumer, path: string): Promise<string> {
    //     Logger.info(req, "Ollama Transcription Start");
    //     try {
    //         const convertedPath = await convertAudioFile(path);
    //         const transcript: WhisperResult = await whisper(convertedPath, {
    //             modelName: "base.en"
    //         });

    //         const collect = transcript.map((item) => item.speech.trim()).join(" ");
    //         Logger.info(req, "Ollama Transcription Completion Success");
    //         Logger.debug("Ollama Transcription Output: ", collect);
    //         return collect;
    //     } catch (err: unknown) {
    //         Logger.error(req, "Ollama Transcription Error, attempting OpenAI fallback. Error: ", err);
    //         return HennosOpenAISingleton.instance().transcription(req, path);
    //     }
    // }

    public async speech(user: HennosUser, input: string): Promise<ArrayBuffer> {
        Logger.warn(user, "Ollama Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}

/**
 * ffmpeg -i input.mp3 -ar 16000 output.wav
 * @param path 
 * @returns 
 */
export function convertAudioFile(path: string): Promise<string> {
    Logger.debug(`Ollama Convert Audio File Path: ${path}`);
    return new Promise((resolve, reject) => {
        ffmpeg({
            source: path
        })
            .addOption(["-ar", "16000"]).addOutput(`${path}.wav`)
            .on("end", function () {
                Logger.debug("Ollama Convert Audio File End");
                resolve(`${path}.wav`);
            })
            .on("error", function (err) {
                Logger.debug("Ollama Convert Audio File Error");
                reject(err);
            }).run();
    });
}