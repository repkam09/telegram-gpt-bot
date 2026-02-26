import { Config, HennosModelConfig } from "./config";
import { Logger } from "./logger";
import { CompletionContextEntry, CompletionResponse, HennosInvokeResponse, HennosMessage, HennosTool } from "../provider";
import Anthropic from "@anthropic-ai/sdk";
import { HennosOpenAISingleton } from "./openai";
import { Usage } from "@anthropic-ai/sdk/resources";

export class HennosAnthropicSingleton {
    private static _instance: HennosAnthropicProvider | null = null;
    private static _mini: HennosAnthropicProvider | null = null;

    public static high(): HennosAnthropicProvider {
        if (!HennosAnthropicSingleton._instance) {
            HennosAnthropicSingleton._instance = new HennosAnthropicProvider(Config.ANTHROPIC_LLM);
        }
        return HennosAnthropicSingleton._instance;
    }

    public static low(): HennosAnthropicProvider {
        if (!HennosAnthropicSingleton._mini) {
            HennosAnthropicSingleton._mini = new HennosAnthropicProvider(Config.ANTHROPIC_MINI_LLM);
        }
        return HennosAnthropicSingleton._mini;
    }
}

type AnthropicCompletionResponse = AnthropicCompletionResponseString | AnthropicCompletionResponseTool;

type AnthropicCompletionResponseString = {
    __type: "string";
    payload: string;
}

type AnthropicCompletionResponseTool = {
    __type: "tool";
    payload: {
        name: string;
        input: string;
        id: string;
    };
}

export class HennosAnthropicProvider {
    public client: Anthropic;
    private model: HennosModelConfig;

    constructor(model: HennosModelConfig) {
        this.client = new Anthropic({
            apiKey: Config.ANTHROPIC_API_KEY,
        });

        this.model = model;
    }

    public async invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse> {
        Logger.info(workflowId, `Anthropic Invoke Start (${this.model.MODEL})`);
        const converted = tools ? convertHennosTools(tools) : undefined;
        const prompt = convertHennosMessages(messages);

        const result = await this._invoke(workflowId, prompt, converted);

        if (result.__type === "string") {
            Logger.info(workflowId, "Anthropic Invoke Success, Resulted in String Response");
            return {
                __type: "string",
                payload: result.payload
            };
        }

        if (result.__type === "tool") {
            return {
                __type: "tool",
                payload: {
                    name: result.payload.name,
                    input: result.payload.input,
                }
            };
        }

        throw new Error("Anthropic Invoke Failed, Unhandled Response Type");
    }

    private async _invoke(workflowId: string, prompt: Anthropic.Messages.MessageParam[], tools?: Anthropic.Messages.ToolUnion[]): Promise<AnthropicCompletionResponse> {
        Logger.debug(workflowId, `Prompt Length: ${prompt.length}, Tools: ${tools ? tools.length : 0}`);

        const response: Anthropic.Messages.Message = await this.client.messages.create({
            model: this.model.MODEL,
            messages: prompt,
            tools: tools,
            max_tokens: this.model.CTX
        });

        Logger.info(workflowId, `Anthropic Invoke Success, Usage: ${calculateUsage(response.usage)}`);
        throw new Error(`Anthropic Invoke Failed, Unhandled Finish Reason: ${response.stop_reason}`);
    }

    public async completion(workflowId: string, messages: CompletionContextEntry[], iterations: number, tools?: HennosTool[]): Promise<CompletionResponse> {
        return HennosOpenAISingleton.high().completion(workflowId, messages, iterations, tools);
    }

    public async moderation(workflowId: string, input: string): Promise<boolean> {
        return HennosOpenAISingleton.high().moderation(workflowId, input);
    }
}

function calculateUsage(usage: Usage | undefined): string {
    if (!usage) {
        return "Unknown";
    }

    return `Input: ${usage.input_tokens} tokens, Output: ${usage.output_tokens} tokens`;
}

type ChatCompletionRole = "user" | "assistant";

export function convertHennosMessages(messages: HennosMessage[]): Anthropic.Messages.MessageParam[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text" && val.content && val.content.length > 0) {
            if (val.role === "user" || val.role === "assistant") {
                acc.push({
                    role: val.role satisfies ChatCompletionRole,
                    content: val.content
                });
            }
        }
        return acc;
    }, [] as Anthropic.Messages.MessageParam[]);
}

export function convertHennosTools(tools: HennosTool[]): Anthropic.Messages.ToolUnion[] {
    const names: string[] = [];
    const result = tools.map(tool => {
        if (!tool.function || !tool.function.name) {
            throw new Error(`Invalid Tool Shape for Anthropic, Missing Function or Function Name, Tool: ${JSON.stringify(tool)}`);
        }

        names.push(tool.function.name);
        return {
            name: tool.function.name,
            description: tool.function.description,
            input_schema: {
                type: "object",
                properties: tool.function.parameters
            },
        } satisfies Anthropic.Messages.Tool;
    });

    Logger.debug(undefined, `Loaded ${result.length} tools for Anthropic: ${names.join(", ")}`);
    return result;
}
