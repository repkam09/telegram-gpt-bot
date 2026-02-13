import { Config, HennosModelConfig } from "./config";
import OpenAI from "openai";
import { Logger } from "./logger";
import { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionTool, ChatCompletionUserMessageParam } from "openai/resources";
import { HennosInvokeResponse, HennosMessage, HennosTool } from "../provider";

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

    public async invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse> {
        Logger.info(workflowId, `OpenAI Invoke Start (${this.model.MODEL})`);
        const converted = tools ? convertHennosTools(tools) : undefined;
        const prompt = convertHennosMessages(messages);

        return this._invoke(workflowId, prompt, converted);
    }

    private async _invoke(workflowId: string, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[], tools?: ChatCompletionTool[]): Promise<HennosInvokeResponse> {
        const response = await this.client.chat.completions.create({
            model: this.model.MODEL,
            messages: prompt,
            safety_identifier: `${workflowId}`,
            tool_choice: tools ? "auto" : undefined,
            tools: tools,
            parallel_tool_calls: tools ? false : undefined
        });

        Logger.info(workflowId, `OpenAI Invoke Success, Usage: ${calculateUsage(response.usage)}`);
        if (!response.choices && !response.choices[0]) {
            throw new Error("Invalid OpenAI Response Shape, Missing Expected Choices");
        }

        const choice = response.choices[0];
        if (choice.finish_reason === "stop") {
            if (!choice.message.content) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Content on Stop Finish Reason");
            }

            Logger.info(workflowId, "OpenAI Invoke Success, Resulted in Stop Finish Reason");
            return {
                __type: "string",
                payload: choice.message.content
            };
        }

        if (choice.finish_reason === "content_filter") {
            Logger.info(workflowId, "OpenAI Invoke Success, Resulted in Content Filter Trigger");
            return {
                __type: "string",
                payload: "Content Filter Triggered. The model refused to generate a response based on the input provided."
            };
        }

        if (choice.finish_reason === "length") {
            Logger.info(workflowId, "OpenAI Invoke Success, Resulted in Length Limit");
            prompt.push({
                role: "assistant",
                content: choice.message.content ? choice.message.content : ""
            });
            return this._invoke(workflowId, prompt, tools);
        }

        if (choice.finish_reason === "tool_calls") {
            Logger.info(workflowId, "OpenAI Invoke Success, Resulted in Tool Call");
            if (!choice.message.tool_calls || choice.message.tool_calls.length !== 1) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Tool Calls on Tool Calls Finish Reason");
            }

            const toolCall = choice.message.tool_calls[0];
            if (toolCall.type === "custom") {
                throw new Error("OpenAI Invoke Failed, Custom Tool Calls are not supported in Hennos at this time");
            }

            return {
                __type: "tool",
                payload: {
                    uuid: toolCall.id,
                    name: toolCall.function.name,
                    input: toolCall.function.arguments
                }
            };
        }

        throw new Error(`OpenAI Invoke Failed, Unhandled Finish Reason: ${choice.finish_reason}`);
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

type ChatCompletionRole = ChatCompletionUserMessageParam["role"] | ChatCompletionAssistantMessageParam["role"] | ChatCompletionSystemMessageParam["role"];

export function convertHennosMessages(messages: HennosMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text" && val.content && val.content.length > 0) {
            acc.push({
                role: val.role satisfies ChatCompletionRole,
                content: val.content
            });
        }
        return acc;
    }, [] as OpenAI.Chat.Completions.ChatCompletionMessageParam[]);
}

export function convertHennosTools(tools: HennosTool[]): ChatCompletionTool[] {
    return tools.map(tool => {
        if (!tool.function || !tool.function.name) {
            throw new Error(`Invalid Tool Shape for OpenAI, Missing Function or Function Name, Tool: ${JSON.stringify(tool)}`);
        }

        return {
            type: "function",
            function: {
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters
            }
        };
    });
}
