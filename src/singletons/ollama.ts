/* eslint-disable @typescript-eslint/no-unused-vars */
import { Message, Ollama, ToolCall } from "ollama";
import ffmpeg from "fluent-ffmpeg";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosUser } from "./user";
import { availableTools, processToolCalls } from "../tools/tools";
import { ToolCallMetadata } from "../tools/BaseTool";

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
        const prompt = system.concat(chat);

        return this.completionWithRecursiveToolCalls(req, prompt, 0);
    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, prompt: Message[], depth: number): Promise<string> {
        if (depth > 4) {
            throw new Error("Tool Call Recursion Depth Exceeded");
        }

        try {
            Logger.debug("\n\n", JSON.stringify(prompt), "\n\n");

            const response = await this.ollama.chat({
                stream: false,
                model: Config.OLLAMA_LLM.MODEL,
                messages: prompt,
                tools: availableTools(req)
            });

            Logger.info(req, `Ollama Completion Success, Resulted in ${response.eval_count} output tokens`);
            if (response.message.tool_calls && response.message.tool_calls.length > 0) {
                Logger.info(req, `Ollama Completion Success, Resulted in ${response.message.tool_calls.length} Tool Calls`);
                const tool_calls = response.message.tool_calls.map((tool_call) => {
                    return [tool_call, {}] as [ToolCall, ToolCallMetadata];
                });

                prompt.push({
                    role: "assistant",
                    content: response.message.content,
                    tool_calls: response.message.tool_calls
                });

                const results = await processToolCalls(req, tool_calls);
                results.forEach(([result]) => {
                    prompt.push({
                        role: "tool",
                        content: result
                    });
                });

                return this.completionWithRecursiveToolCalls(req, prompt, depth + 1);
            }

            Logger.info(req, "Ollama Completion Success, Resulted in Text Completion");
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

    public async speech(user: HennosUser, input: string): Promise<ArrayBuffer> {
        Logger.warn(user, "Ollama Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}
