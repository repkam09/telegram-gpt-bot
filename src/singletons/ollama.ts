/* eslint-disable @typescript-eslint/no-unused-vars */
import { Message, Ollama, ToolCall } from "ollama";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosConsumer, HennosUser } from "./consumer";
import { availableTools, processToolCalls } from "../tools/tools";
import { ToolCallMetadata } from "../tools/BaseTool";
import { HennosMessage, HennosResponse, HennosTextMessage } from "../types";

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
    public client: Ollama;
    private static _parallel = 0;

    constructor() {
        super();

        this.client = new Ollama({
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        });
    }

    public details(): string {
        return `Open Source model ${Config.OLLAMA_LLM.MODEL} running under Ollama.`;
    }

    public async completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Ollama Completion Start (${Config.OLLAMA_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.OLLAMA_LLM.CTX);

        const systemMessages: HennosMessage[] = Array.from(system);
        const prompt = systemMessages.concat(chat);

        const converted = convertHennosMessages(prompt);
        try {
            return this.completionWithRecursiveToolCalls(req, converted, 0);
        } catch (err: unknown) {
            const error = err as Error;
            Logger.info(req, `Ollama Completion Error: ${error.message}. Attempting OpenAI Fallback.`);
            return HennosOpenAISingleton.instance().completion(req, system, complete);
        }

    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, prompt: Message[], depth: number): Promise<HennosResponse> {
        if (depth > Config.HENNOS_TOOL_DEPTH) {
            throw new Error("Tool Call Recursion Depth Exceeded");
        }

        try {
            const response = await this.client.chat({
                stream: false,
                model: Config.OLLAMA_LLM.MODEL,
                messages: prompt,
                tools: availableTools(req)
            });

            Logger.info(req, `Ollama Completion Success, Resulted in ${response.eval_count} output tokens.  (depth=${depth})`);
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

                const shouldEmptyResponse = results.find(([, , response]) => response?.__type === "empty");
                if (shouldEmptyResponse) {
                    Logger.debug(req, "Ollama Completion Requested Empty Response, Stopping Processing");
                    return {
                        __type: "empty"
                    };
                }

                const shouldStringResponse = results.find(([, , response]) => response?.__type === "string");
                if (shouldStringResponse) {
                    Logger.debug(req, "Ollama Completion Requested String Response, Stopping Processing");
                    return shouldStringResponse[2] as HennosResponse;
                }

                results.forEach(([result]) => {
                    prompt.push({
                        role: "tool",
                        content: result
                    });
                });

                return this.completionWithRecursiveToolCalls(req, prompt, depth + 1);
            }

            // If we're using a thinking model, we might get back thoughts within <think> ... </think> tags.
            // We should strip these out before returning to the user. Find the index of the first </think> tag and strip everything before it.

            const thinkingBlock = response.message.content.indexOf("</think>");
            if (thinkingBlock !== -1) {
                const cleaned = response.message.content.substring(thinkingBlock + 8).trim();
                Logger.info(req, "Ollama Completion Success, Stripped Thinking Tags");
                return {
                    __type: "string",
                    payload: cleaned
                };
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
        Logger.warn(req, "Ollama Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, path);
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.warn(user, "Ollama Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}
