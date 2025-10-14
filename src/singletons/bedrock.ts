import { HennosBaseProvider } from "./base";
import { BedrockRuntimeClient, ConverseCommand, Message } from "@aws-sdk/client-bedrock-runtime";
import { Config } from "./config";
import { HennosTextMessage, HennosMessage, HennosResponse } from "../types";
import { HennosConsumer } from "./consumer";
import { Logger } from "./logger";
import { HennosOpenAISingleton } from "./openai";
import { getSizedChatContext } from "./context";

export class HennosBedrockSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosBedrockSingleton._instance) {
            HennosBedrockSingleton._instance = new HennosBedrockProvider();
        }
        return HennosBedrockSingleton._instance;
    }
}

class HennosBedrockProvider extends HennosBaseProvider {
    public client: BedrockRuntimeClient;

    constructor() {
        super();

        this.client = new BedrockRuntimeClient({
            region: Config.AWS_BEDROCK_REGION,
            token: {
                token: Config.AWS_BEARER_TOKEN_BEDROCK
            },
        });
    }

    public details(): string {
        return `AWS Bedrock model ${Config.AWS_BEDROCK_LLM.MODEL}`;
    }


    private convertMessages(messages: HennosMessage[]): Message[] {
        const converted: Message[] = [];

        for (const msg of messages) {
            if (msg.type === "text") {
                if (msg.role === "user") {
                    converted.push({
                        role: "user",
                        content: [{
                            text: msg.content
                        }]
                    });
                } else {
                    converted.push({
                        role: "assistant",
                        content: [{
                            text: msg.content
                        }]
                    });
                }
            }
        }

        return converted;
    }

    public async completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Bedrock Completion Start with model ${Config.AWS_BEDROCK_LLM.MODEL}`);

        const trimmed = await getSizedChatContext(req, system, complete, Config.AWS_BEDROCK_LLM.CTX);

        const command = new ConverseCommand({
            modelId: Config.AWS_BEDROCK_LLM.MODEL,
            system: [{
                text: system.map(s => s.content).join("\n")
            }],
            messages: this.convertMessages(trimmed),
        });

        try {
            const data = await this.client.send(command);
            if (!data.output || !data.output.message || !data.output.message.content) {
                throw new Error("Unexpected Bedrock response format");
            }

            if (!data.output.message.content[0] || !data.output.message.content[0].text) {
                throw new Error("No content in Bedrock response");
            }

            Logger.info(req, `Bedrock Completion Success, Resulted in Text Completion. Usage: ${data.usage ? JSON.stringify(data.usage) : "N/A"}`);

            return {
                __type: "string",
                payload: data.output.message.content[0].text
            };
        } catch (err: unknown) {

            Logger.error(req, `Bedrock Completion Error: ${err}`);
            return HennosOpenAISingleton.instance().completion(req, system, complete);
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Bedrock Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, path: string): Promise<HennosResponse> {
        Logger.warn(req, "Bedrock Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, path);
    }

    public async speech(req: HennosConsumer, input: string): Promise<HennosResponse> {
        Logger.warn(req, "Bedrock Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(req, input);
    }
}