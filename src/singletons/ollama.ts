/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Message, Ollama, ToolCall } from "ollama";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer, HennosEncodedImage, HennosResponse } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosUser } from "./user";
import { availableTools, processToolCalls } from "../tools/tools";
import { ToolCallMetadata } from "../tools/BaseTool";
import { HennosMockSingleton } from "./mock";

export class HennosOllamaSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (Config.HENNOS_MOCK_PROVIDERS) {
            return HennosMockSingleton.instance();
        }
        
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

    public async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<HennosResponse> {
        Logger.info(req, `Ollama Completion Start (${Config.OLLAMA_LLM.MODEL})`);

        const messages: Message[] = convertMessages(complete);

        const chat = await getSizedChatContext(req, system, messages, Config.OLLAMA_LLM.CTX);
        const prompt = system.concat(chat);

        return this.completionWithRecursiveToolCalls(req, prompt, 0);
    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, prompt: Message[], depth: number): Promise<HennosResponse> {
        if (depth > 4) {
            throw new Error("Tool Call Recursion Depth Exceeded");
        }

        try {
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

                const shouldEmptyResponse = results.find((result) => result[2] === "empty");
                if (shouldEmptyResponse) {
                    return {
                        __type: "empty"
                    };
                }

                results.forEach(([result]) => {
                    prompt.push({
                        role: "tool",
                        content: result
                    });
                });

                return this.completionWithRecursiveToolCalls(req, prompt, depth + 1);
            }

            Logger.info(req, "Ollama Completion Success, Resulted in Text Completion");
            return {
                __type: "string",
                payload: response.message.content
            };
        } catch (err: unknown) {
            Logger.info(req, "Ollama Completion Error: ", err);
            throw err;
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Ollama Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, path: string): Promise<HennosResponse> {
        Logger.info(req, "Ollama Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, path);
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.warn(user, "Ollama Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}

export function convertMessages(messages: Message[]): Message[] {
    return messages.map((message) => {
        if (message.role === "user_image") {
            return {
                role: "user",
                content: "",
                images: [message.images![0] as HennosEncodedImage]
            };
        }

        if (message.role === "assistant_image") {
            return {
                role: "assistant",
                content: "",
                images: [message.images![0] as HennosEncodedImage]
            };
        }
        return message;
    });
}