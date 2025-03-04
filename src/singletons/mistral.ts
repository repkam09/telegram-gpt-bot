import { Mistral } from "@mistralai/mistralai";
import { AssistantMessage, SystemMessage, Tool, ToolMessage, UserMessage } from "@mistralai/mistralai/models/components";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosUser } from "./user";
import { availableTools } from "../tools/tools";
import { HennosMessage, HennosResponse, HennosTextMessage } from "../types";

type MistralMessage =
    | (SystemMessage & { role: "system" })
    | (UserMessage & { role: "user" })
    | (AssistantMessage & { role: "assistant" })
    | (ToolMessage & { role: "tool" })

export class HennosMistralSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosMistralSingleton._instance) {
            HennosMistralSingleton._instance = new HennosMistralProvider();
        }
        return HennosMistralSingleton._instance;
    }
}

function convertHennosMessages(messages: HennosMessage[]): MistralMessage[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text") {
            acc.push({
                role: val.role,
                content: val.content
            });
        }
        return acc;
    }, [] as MistralMessage[]);
}

function convertAvailableTools(req: HennosConsumer): Tool[] {
    const tools = availableTools(req);
    if (!tools) {
        return [];
    }
    return [];
}

class HennosMistralProvider extends HennosBaseProvider {
    public client: Mistral;
    private static _parallel = 0;

    constructor() {
        super();

        this.client = new Mistral({
            apiKey: Config.MISTRAL_API_KEY,
        });
    }

    public details(): string {
        return `Mistral.ai model ${Config.MISTRAL_LLM.MODEL} running under Ollama.`;
    }

    public async completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Mistral Completion Start (${Config.OLLAMA_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.OLLAMA_LLM.CTX);
        const converted = convertHennosMessages([...system, ...chat]);

        try {
            return this.completionWithRecursiveToolCalls(req, converted, 0);
        } catch (err: unknown) {
            const error = err as Error;
            Logger.info(req, `Mistral Completion Error: ${error.message}. Attempting OpenAI Fallback.`);
            return HennosOpenAISingleton.instance().completion(req, system, complete);
        }
    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, prompt: MistralMessage[], depth: number): Promise<HennosResponse> {
        if (depth > Config.HENNOS_TOOL_DEPTH) {
            throw new Error("Tool Call Recursion Depth Exceeded");
        }

        try {
            const response = await this.client.chat.complete({
                model: Config.MISTRAL_LLM.MODEL,
                stream: false,
                messages: prompt,
                tools: convertAvailableTools(req)
            });

            Logger.info(req, `Mistral Completion Success, Resulted in ${response.usage.completionTokens} output tokens.  (depth=${depth})`);
            Logger.info(req, "Mistral Completion Success, Resulted in Text Completion");

            if (!response.choices) {
                Logger.info(req, "Mistral Completion Error: No Choices");
                return {
                    __type: "empty"
                };
            }

            if (!response.choices.length) {
                Logger.info(req, "Mistral Completion Error: Empty Choices");
                return {
                    __type: "empty"
                };
            }

            if (!response.choices[0].message) {
                Logger.info(req, "Mistral Completion Error: No Message");
                return {
                    __type: "empty"
                };
            }

            if (response.choices[0].finishReason !== "stop") {
                Logger.info(req, "Mistral Completion Error: Finish Reason");
                return {
                    __type: "empty"
                };
            }

            if (typeof response.choices[0].message.content !== "string") {
                Logger.info(req, "Mistral Completion Error: No Content");
                return {
                    __type: "empty"
                };
            }

            return {
                __type: "string",
                payload: response.choices[0].message.content
            };
        } catch (err: unknown) {
            Logger.info(req, "Mistral Completion Error: ", err);
            throw err;
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Mistral Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, file: string | Buffer): Promise<HennosResponse> {
        Logger.warn(req, "Mistral Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, file);
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.warn(user, "Mistral Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}
