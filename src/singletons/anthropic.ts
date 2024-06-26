import fs from "node:fs/promises";
import { Config } from "./config";
import { Anthropic } from "@anthropic-ai/sdk";
import { HennosUser } from "./user";
import { Message } from "ollama";
import { MessageParam, TextBlock } from "@anthropic-ai/sdk/resources";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosOpenAISingleton } from "./openai";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { ALL_AVAILABLE_ANTHROPIC_MODELS } from "llamaindex";

export class HennosAnthropicSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosAnthropicSingleton._instance) {
            HennosAnthropicSingleton._instance = new HennosAnthropicProvider();
        }
        return HennosAnthropicSingleton._instance;
    }
}

export type ValidAnthropicModels = keyof typeof ALL_AVAILABLE_ANTHROPIC_MODELS;

class HennosAnthropicProvider extends HennosBaseProvider {
    private anthropic: Anthropic;

    constructor() {
        super();

        this.anthropic = new Anthropic({
            apiKey: Config.ANTHROPIC_API_KEY
        });
    }

    public async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string> {
        Logger.info(req, `Anthropic Completion Start (${Config.ANTHROPIC_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.ANTHROPIC_LLM.CTX);

        const messages = chat.filter((entry) => entry.role !== "system").reduce((acc: MessageParam[], current: Message, index: number) => {
            if (index === 0) {
                return [current as MessageParam];
            }

            const previous = acc[acc.length - 1];

            if (previous.role === current.role) {
                // If the roles are the same, combine the messages
                previous.content += "\n" + current.content;
                return acc;
            } else if (
                (previous.role === "user" && current.role === "assistant") ||
                (previous.role === "assistant" && current.role === "user")
            ) {
                return [...acc, current as MessageParam];
            } else {
                return acc;
            }
        }, [] as MessageParam[]);

        if (messages[0].role === "assistant") {
            messages.shift();
        }

        try {
            const combinedSystemPrompt = system.map((message) => message.content).join(" ");
            const response = await this.anthropic.messages.create({
                system: combinedSystemPrompt,
                model: Config.ANTHROPIC_LLM.MODEL,
                max_tokens: 4096,
                messages
            });

            const text_blocks = response.content.filter((content) => content.type === "text") as TextBlock[];
            const result = text_blocks.map((block) => block.text).join();
            Logger.info(req, `Anthropic Completion Success, Resulted in ${response.usage.output_tokens} output tokens`);

            return result;
        } catch (err: unknown) {
            Logger.info(req, "Anthropic Completion Error: ", err);
            throw err;
        }
    }

    public async vision(req: HennosConsumer, prompt: Message, local: string, mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp"): Promise<string> {
        Logger.info(req, `Anthropic Vision Completion Start (${Config.ANTHROPIC_LLM_VISION.MODEL})`);
        try {

            // Take the local image and convert it to base64...
            const raw = await fs.readFile(local);
            const data = Buffer.from(raw).toString("base64");

            const response = await this.anthropic.messages.create({
                model: Config.ANTHROPIC_LLM_VISION.MODEL,
                max_tokens: 4096,
                messages: [
                    {
                        role: prompt.role as MessageParam["role"],
                        content: [
                            {
                                type: "text",
                                text: prompt.content
                            },
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: mime,
                                    data
                                }
                            }
                        ]
                    }
                ]
            });

            const text_blocks = response.content.filter((content) => content.type === "text") as TextBlock[];
            const result = text_blocks.map((block) => block.text).join();
            Logger.info(req, `Anthropic Vision Completion Success, Resulted in ${response.usage.output_tokens} output tokens`);
            return result;
        } catch (err: unknown) {
            Logger.info(req, "Anthropic Vision Completion Completion Error: ", err);
            throw err;
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Anthropic Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, path: string): Promise<string> {
        Logger.warn(req, "Anthropic Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, path);
    }

    public async speech(user: HennosUser, input: string): Promise<ArrayBuffer> {
        Logger.warn(user, "Anthropic Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}