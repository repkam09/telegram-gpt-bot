import fs from "node:fs/promises";
import { Config } from "./config";
import { Anthropic } from "@anthropic-ai/sdk";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";
import { Message } from "ollama";
import { MessageParam, TextBlock } from "@anthropic-ai/sdk/resources";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";

type HennosConsumer = HennosUser | HennosGroup

export class HennosAnthropicProvider {
    private static _instance: Anthropic;

    private static instance(): Anthropic {
        if (!HennosAnthropicProvider._instance) {
            HennosAnthropicProvider._instance = new Anthropic({
                apiKey: Config.ANTHROPIC_API_KEY
            });
        }
        return HennosAnthropicProvider._instance;
    }

    public static async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string> {
        Logger.info(req, `Anthropic Completion Start (${Config.ANTHROPIC_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.ANTHROPIC_LLM.CTX);

        const messages = chat.reduce((acc: MessageParam[], current: Message, index: number) => {
            if (index === 0) {
                // Always add the first message
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
            const response = await HennosAnthropicProvider.instance().messages.create({
                system: system.map((message) => ({
                    type: "text",
                    text: message.content
                })),
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

    public static async vision(req: HennosConsumer, prompt: Message, local: string, mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp"): Promise<string> {
        Logger.info(req, `Anthropic Vision Completion Start (${Config.ANTHROPIC_LLM_VISION.MODEL})`);
        try {

            // Take the local image and convert it to base64...
            const raw = await fs.readFile(local);
            const data = Buffer.from(raw).toString("base64");

            const response = await HennosAnthropicProvider.instance().messages.create({
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
}