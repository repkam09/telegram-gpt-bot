import { Config, HennosModelConfig } from "./config";
import OpenAI from "openai";
import { Logger } from "./logger";
import { ChatCompletionAssistantMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { HennosStringResponse, HennosTextMessage } from "../types";

type MessageRoles = ChatCompletionUserMessageParam["role"] | ChatCompletionAssistantMessageParam["role"]


export class HennosOpenAISingleton {
    private static _instance: HennosOpenAIProvider | null = null;
    private static _mini: HennosOpenAIProvider | null = null;

    public static instance(): HennosOpenAIProvider {
        if (!HennosOpenAISingleton._instance) {
            HennosOpenAISingleton._instance = new HennosOpenAIProvider(Config.OPENAI_LLM);
        }
        return HennosOpenAISingleton._instance;
    }

    public static mini(): HennosOpenAIProvider {
        if (!HennosOpenAISingleton._mini) {
            HennosOpenAISingleton._mini = new HennosOpenAIProvider(Config.OPENAI_MINI_LLM);
        }
        return HennosOpenAISingleton._mini;
    }
}

export class HennosOpenAIProvider {
    public client: OpenAI;
    private model: HennosModelConfig;
    private moderationModel: string;


    constructor(model: HennosModelConfig) {
        this.client = new OpenAI({
            apiKey: Config.OPENAI_API_KEY,
        });

        this.model = model;
        this.moderationModel = "omni-moderation-latest";

    }

    public async invoke(workflowId: string, messages: HennosTextMessage[], schema?: boolean): Promise<HennosStringResponse> {
        Logger.info(workflowId, `OpenAI Invoke Start (${this.model.MODEL})`);
        const prompt = convertHennosMessages(messages);
        return this._invoke(workflowId, prompt, schema);
    }

    private async _invoke(workflowId: string, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[], schema?: boolean): Promise<HennosStringResponse> {
        const response = await this.client.chat.completions.create({
            model: this.model.MODEL,
            messages: prompt,
            safety_identifier: `${workflowId}`,
            response_format: schema ? { type: "json_object" } : undefined
        });

        Logger.info(workflowId, `OpenAI Invoke Success, Usage: ${calculateUsage(response.usage)}`);
        if (!response.choices && !response.choices[0]) {
            throw new Error("Invalid OpenAI Response Shape, Missing Expected Choices");
        }

        if (!response.choices[0].message.tool_calls && !response.choices[0].message.content) {
            throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Properties");
        }

        // If this is a normal response with no tool calling, return the content
        if (response.choices[0].message.content) {
            if (response.choices[0].finish_reason === "length") {
                Logger.info(workflowId, "OpenAI Invoke Success, Resulted in Length Limit");
                prompt.push({
                    role: "assistant",
                    content: response.choices[0].message.content
                });
                return this._invoke(workflowId, prompt, schema);
            }

            Logger.info(workflowId, "OpenAI Invoke Success, Resulted in Text Completion");
            return {
                __type: "string",
                payload: response.choices[0].message.content
            };
        }

        throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Content");
    }

    public async moderation(workflowId: string, input: string): Promise<boolean> {
        Logger.info(workflowId, "OpenAI Moderation Start");
        try {
            const response = await this.client.moderations.create({
                model: this.moderationModel,
                input
            });

            if (!response.results) {
                return false;
            }

            if (!response.results[0]) {
                return false;
            }

            const flagged = response.results[0].flagged;
            Logger.info(workflowId, `OpenAI Moderation Success, Result: ${flagged ? "Blocked" : "Allowed"}, Input: ${input}`);
            return flagged;
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, "OpenAI Moderation Error: ", error);
            return false;
        }
    }
}

function calculateUsage(usage: OpenAI.Completions.CompletionUsage | undefined): string {
    if (!usage) {
        return "Unknown";
    }

    return `Input: ${usage.prompt_tokens} tokens, Output: ${usage.completion_tokens}`;
}

export function convertHennosMessages(messages: HennosTextMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text" && val.content && val.content.length > 0) {
            acc.push({
                role: val.role as MessageRoles,
                content: val.content
            });
        }
        return acc;
    }, [] as OpenAI.Chat.Completions.ChatCompletionMessageParam[]);
}
