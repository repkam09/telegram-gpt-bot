import { Config, HennosModelConfig } from "./config";
import { Logger } from "./logger";
import { CompletionContextEntry, CompletionResponse, HennosInvokeResponse, HennosMessage, HennosTool } from "../provider";
import Anthropic from "@anthropic-ai/sdk";
import { HennosOpenAISingleton } from "./openai";

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

// type AnthropicCompletionResponse = AnthropicCompletionResponseString | AnthropicCompletionResponseTool;

// type AnthropicCompletionResponseString = {
//     __type: "string";
//     payload: string;
// }

// type AnthropicCompletionResponseTool = {
//     __type: "tool";
//     payload: {
//         name: string;
//         input: string;
//         id: string;
//     };
// }

export class HennosAnthropicProvider {
    public client: Anthropic;
    private model: HennosModelConfig;

    constructor(model: HennosModelConfig) {
        this.client = new Anthropic({
            apiKey: Config.ANTHROPIC_API_KEY,
        });

        this.model = model;
    }

    public limit(): number {
        return this.model.CTX;
    }

    public async invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse> {
        return HennosOpenAISingleton.high().invoke(workflowId, messages, tools);
    }

    public async completion(workflowId: string, messages: CompletionContextEntry[], iterations: number, tools?: HennosTool[]): Promise<CompletionResponse> {
        return HennosOpenAISingleton.high().completion(workflowId, messages, iterations, tools);
    }

    public async moderation(workflowId: string, input: string): Promise<boolean> {
        return HennosOpenAISingleton.high().moderation(workflowId, input);
    }
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
