/* eslint-disable @typescript-eslint/no-unused-vars */
import { Message, Ollama, ToolCall } from "ollama";
import { whisper } from "whisper-node";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosUser } from "./user";
import { availableTools, processToolCalls } from "../tools/tools";
import { ToolCallMetadata } from "../tools/BaseTool";
import { randomUUID } from "node:crypto";
import { HennosImage, HennosMessage, HennosMessageRole, HennosResponse, HennosTextMessage } from "../types";
import path from "node:path";
import fs from "node:fs/promises";

export class HennosOllamaSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosOllamaSingleton._instance) {
            HennosOllamaSingleton._instance = new HennosOllamaProvider();
        }
        return HennosOllamaSingleton._instance;
    }
}

function convertHennosMessages(messages: HennosMessage[]): Message[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text") {
            acc.push({
                role: val.role,
                content: val.content
            });
        }

        if (val.type === "image") {
            // Image messages are not supported by Ollama
            // until llama3.2-vision is better supported.

            // acc.push({
            //     role: val.role,
            //     content: "",
            //     // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            //     images: [val.image!.local]
            // });
        }
        return acc;
    }, [] as Message[]);
}

class HennosOllamaProvider extends HennosBaseProvider {
    private ollama: Ollama;

    constructor() {
        super();

        this.ollama = new Ollama({
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        });
    }

    public async completion(req: HennosConsumer, system: HennosMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Ollama Completion Start (${Config.OLLAMA_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.OLLAMA_LLM.CTX);
        const prompt = system.concat(chat);

        const converted = convertHennosMessages(prompt);
        return this.completionWithRecursiveToolCalls(req, converted, 0);
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

                const shouldEmptyResponse = results.find(([_content, _metadata, type]) => type === "empty");
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

    public async transcription(req: HennosConsumer, file: string | Buffer): Promise<HennosResponse> {
        let pathString: string;
        if (typeof file !== "string") {
            Logger.debug(req, "Ollama Transcription Start (Buffer)");
            pathString = path.join(Config.LOCAL_STORAGE(req), `discord_${randomUUID()}.wav`);
            await fs.writeFile(pathString, file);
        } else {
            Logger.debug(req, "Ollama Transcription Start (Path)");
            pathString = file;
        }

        const transcript = await whisper(pathString);
        const result = transcript.map((entry) => entry.speech).join(" ");
        return {
            __type: "error",
            payload: result
        };
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.warn(user, "Ollama Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}
