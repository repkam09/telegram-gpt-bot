/* eslint-disable @typescript-eslint/no-unused-vars */
import { Config } from "./config";
import OpenAI from "openai";
import { HennosUser } from "./user";
import { Message } from "ollama";
import { Logger } from "./logger";
import { ChatCompletionAssistantMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { createReadStream } from "node:fs";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer } from "./base";

type MessageRoles = ChatCompletionUserMessageParam["role"] | ChatCompletionAssistantMessageParam["role"]

export class HennosOpenAISingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosOpenAISingleton._instance) {
            HennosOpenAISingleton._instance = new HennosOpenAIProvider();
        }
        return HennosOpenAISingleton._instance;
    }
}

class HennosOpenAIProvider extends HennosBaseProvider {
    private openai: OpenAI;

    constructor() {
        super();

        this.openai = new OpenAI({
            apiKey: Config.OPENAI_API_KEY,
        });
    }

    public async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string> {
        Logger.info(req, `OpenAI Completion Start (${Config.OPENAI_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.OPENAI_LLM.CTX);
        try {
            const prompt = system.concat(chat);

            const messages = prompt.map((message) => ({
                content: message.content,
                role: message.role as MessageRoles,
            }));

            const response = await this.openai.chat.completions.create({
                model: Config.OPENAI_LLM.MODEL,
                messages
            });
            Logger.info(req, `OpenAI Completion Success, Resulted in ${response.usage?.completion_tokens} output tokens`);
            if (!response.choices && !response.choices[0]) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Choices");
            }

            if (!response.choices[0].message.content) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Content");
            }

            return response.choices[0].message.content;
        } catch (err: unknown) {
            Logger.error(req, "OpenAI Completion Error: ", err);
            throw err;
        }
    }

    public async vision(req: HennosConsumer, prompt: Message, remote: string, mime: string): Promise<string> {
        Logger.info(req, `OpenAI Vision Completion Start (${Config.OPENAI_LLM_VISION.MODEL})`);
        try {
            const response = await this.openai.chat.completions.create({
                stream: false,
                model: Config.OPENAI_LLM_VISION.MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt.content
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    detail: "auto",
                                    url: remote
                                }
                            }]
                    }
                ]
            });

            Logger.info(req, `OpenAI Vision Completion Success, Resulted in ${response.usage?.completion_tokens} output tokens`);
            if (!response.choices && !response.choices[0]) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Choices");
            }

            if (!response.choices[0].message.content) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Content");
            }

            return response.choices[0].message.content;
        } catch (err: unknown) {
            Logger.info(req, "OpenAI Vision Completion Error: ", err);
            throw err;
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.info(req, "OpenAI Moderation Start");
        try {
            const response = await this.openai.moderations.create({
                input
            });

            if (!response.results) {
                return false;
            }

            if (!response.results[0]) {
                return false;
            }

            const flagged = response.results[0].flagged;
            Logger.info(req, "OpenAI Moderation Success, Result: ", flagged ? "Blocked" : "Allowed");
            return flagged;
        } catch (err: unknown) {
            Logger.error(req, "OpenAI Moderation Error: ", err);
            return false;
        }
    }

    public async transcription(req: HennosConsumer, path: string): Promise<string> {
        Logger.info(req, "OpenAI Transcription Start");
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                model: "whisper-1",
                file: createReadStream(path)
            });

            Logger.info(req, "OpenAI Transcription Success");
            return transcription.text;
        } catch (err: unknown) {
            Logger.error(req, "OpenAI Transcription Error: ", err);
            throw err;
        }
    }

    public async speech(user: HennosUser, input: string): Promise<ArrayBuffer> {
        Logger.info(user, "OpenAI Speech Start");
        try {
            const preferences = await user.getPreferences();
            const result = await this.openai.audio.speech.create({
                model: "tts-1",
                voice: preferences.voice,
                input: input,
                response_format: "opus"
            });

            Logger.info(user, "OpenAI Speech Success");
            return result.arrayBuffer();
        } catch (err: unknown) {
            Logger.error(user, "OpenAI Speech Error: ", err);
            throw err;
        }
    }
}