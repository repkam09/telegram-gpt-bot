import { Config } from "./config";
import { Anthropic } from "@anthropic-ai/sdk";
import { ToolCall } from "ollama";
import { ImageBlockParam, TextBlock, TextBlockParam, Tool, ToolChoiceAuto } from "@anthropic-ai/sdk/resources";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosOpenAISingleton } from "./openai";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { availableTools, processToolCalls } from "../tools/tools";
import { HennosMessage, HennosResponse, HennosTextMessage } from "../types";

export class HennosAnthropicSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosAnthropicSingleton._instance) {
            HennosAnthropicSingleton._instance = new HennosAnthropicProvider();
        }
        return HennosAnthropicSingleton._instance;
    }
}

function getAvailableTools(req: HennosConsumer, allow_tools: boolean): [
    ToolChoiceAuto | undefined,
    Tool[] | undefined
] {

    if (!allow_tools) {
        Logger.debug(req, `Tools disabled for ${req.displayName} because tools are blocked`);
        return [undefined, undefined];
    }

    const tool_choice: ToolChoiceAuto = {
        type: "auto"
    };

    const tools = availableTools(req);
    if (!tools) {
        Logger.debug(req, `Tools disabled for ${req.displayName} because no tools are available`);
        return [undefined, undefined];
    }

    const converted: Tool[] = tools.map((tool) => ({
        name: tool.function.name as string,
        input_schema: {
            ...tool.function.parameters,
            type: "object"
        }
    }));

    Logger.debug(req, `Tools enabled for ${req.displayName}`);
    return [tool_choice, converted];
}


type HennosMessageParam = {
    content: Array<TextBlockParam | ImageBlockParam>;
    role: "user" | "assistant";
}

export function convertMessages(messages: HennosMessage[]): Anthropic.Messages.MessageParam[] {
    const converted: HennosMessageParam[] = [];
    for (const message of messages) {
        if (message.role === "system") {
            // throw away system messages within the conversation for now
        } else {
            if (message.type === "image") {
                converted.push({
                    role: "user",
                    content: [
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                data: message.encoded,
                                media_type: message.image.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp"
                            }
                        }
                    ]
                });
            }

            if (message.type === "text" && message.content && message.content.length > 0) {
                converted.push({
                    role: message.role,
                    content: [
                        {
                            type: "text",
                            text: message.content
                        }
                    ]
                });
            }
        }
    }

    const result = converted.reduce(
        (acc, current, index: number) => {
            if (index === 0) {
                acc.result.push(current);
                acc.previous = current;
                return acc;
            }

            if (acc.previous?.role === current.role) {
                // If the roles are the same, combine the messages
                acc.previous?.content.push(...current.content);
                return acc;
            }

            if (acc.previous?.role === "user" && current.role === "assistant") {
                // If the roles are different, add the new message to the result
                acc.result.push(current);
                acc.previous = current;
                return acc;
            }

            if (acc.previous?.role === "assistant" && current.role === "user") {
                // If the roles are different, add the new message to the result
                acc.result.push(current);
                acc.previous = current;
                return acc;
            }

            return acc;
        }, { result: [] as HennosMessageParam[], previous: undefined as HennosMessageParam | undefined });


    // The first message must also be a user message...
    if (result.result[0].role === "assistant") {
        result.result.shift();
    }

    return result.result;
}


class HennosAnthropicProvider extends HennosBaseProvider {
    public client: Anthropic;

    constructor() {
        super();

        this.client = new Anthropic({
            apiKey: Config.ANTHROPIC_API_KEY
        });
    }

    public details(): string {
        return `Anthropic Claude model ${Config.ANTHROPIC_LLM.MODEL}`;
    }

    public async completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Anthropic Completion Start (${Config.ANTHROPIC_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.ANTHROPIC_LLM.CTX);

        const messages = convertMessages(chat);
        const combinedSystemPrompt = system.map((message) => message.content).join("\n");

        try {
            return this.completionWithRecursiveToolCalls(req, combinedSystemPrompt, messages, 0, true);
        } catch (err: unknown) {
            const error = err as Error;
            Logger.info(req, `Anthropic Completion Error: ${error.message}. Attempting OpenAI Fallback.`);
            return HennosOpenAISingleton.instance().completion(req, system, complete);
        }
    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, system: string, prompt: Anthropic.Messages.MessageParam[], depth: number, allow_tools: boolean): Promise<HennosResponse> {
        if (depth > Config.HENNOS_TOOL_DEPTH) {
            throw new Error("Tool Call Recursion Depth Exceeded");
        }

        try {
            const [tool_choice, tools] = getAvailableTools(req, allow_tools);

            const options: Anthropic.Messages.MessageCreateParamsNonStreaming = {
                system,
                model: Config.ANTHROPIC_LLM.MODEL,
                max_tokens: 4096,
                messages: prompt,
            };

            if (tool_choice && tools) {
                options.tool_choice = tool_choice;
                options.tools = tools;
            }

            const response = await this.client.messages.create(options);

            Logger.info(req, `Anthropic Completion Success, Usage: ${calculateUsage(req, response.usage)}. (depth=${depth})`);
            const tool_blocks = response.content.filter((content) => content.type === "tool_use") as Anthropic.Messages.ToolUseBlock[];
            if (tool_blocks.length > 0) {
                Logger.info(req, `Anthropic Completion Success, Resulted in ${tool_blocks.length} Tool Calls`);
                const toolCalls = convertToolCallResponse(tool_blocks);
                const additional = await processToolCalls(req, toolCalls);

                const shouldEmptyResponse = additional.find(([, , response]) => response?.__type === "empty");
                if (shouldEmptyResponse) {
                    Logger.debug(req, "Anthropic Completion Requested Empty Response, Stopping Processing");
                    return {
                        __type: "empty"
                    };
                }

                const shouldStringResponse = additional.find(([, , response]) => response?.__type === "string");
                if (shouldStringResponse) {
                    Logger.debug(req, "Anthropic Completion Requested String Response, Stopping Processing");
                    return shouldStringResponse[2] as HennosResponse;
                }

                prompt.push({
                    role: "assistant",
                    content: tool_blocks
                });

                prompt.push({
                    role: "user",
                    content: additional.map(([content, metadata]) => {
                        return {
                            type: "tool_result",
                            tool_use_id: metadata.id,
                            content: [{
                                type: "text",
                                text: content
                            }],
                            is_error: false
                        };
                    })
                });

                return this.completionWithRecursiveToolCalls(req, system, prompt, depth + 1, true);
            }

            // Check if we hit the output length limit
            if (response.stop_reason === "max_tokens") {
                const last_message = prompt[prompt.length - 1];
                if (last_message.role === "assistant") {
                    Logger.info(req, "Anthropic Completion Success, Reached Max Tokens, Extending Assistant Message");
                    if (!Array.isArray(last_message.content)) {
                        throw new Error("Expected Assistant Message to Contain Content");
                    }

                    last_message.content = last_message.content.concat(response.content);
                    return this.completionWithRecursiveToolCalls(req, system, prompt, depth + 1, false);
                } else {
                    Logger.info(req, "Anthropic Completion Success, Reached Max Tokens, Adding Assistant Message");
                    prompt.push({
                        role: "assistant",
                        content: response.content
                    });
                    return this.completionWithRecursiveToolCalls(req, system, prompt, depth + 1, false);
                }
            }

            if (response.stop_reason === "refusal") {
                throw new Error("Model declines to generate for safety reasons");
            }

            // Check if we had to extend a response
            const last_message = prompt[prompt.length - 1];
            if (last_message.role === "assistant") {
                if (!Array.isArray(last_message.content)) {
                    throw new Error("Expected Assistant Message to Contain Content");
                }

                // Append the response to the last message
                last_message.content = last_message.content.concat(response.content);

                // Clean the content and convert it to a string
                const text_blocks = last_message.content.filter((content) => content.type === "text") as TextBlock[];
                const result = text_blocks.map((block) => block.text).join();
                Logger.info(req, `Anthropic Completion Success, Resulted in ${text_blocks.length} Text Blocks`);
                return {
                    __type: "string",
                    payload: result
                };
            }

            // This is a normal response, convert it to a string
            const text_blocks = response.content.filter((content) => content.type === "text") as TextBlock[];
            const result = text_blocks.map((block) => block.text).join();

            Logger.info(req, `Anthropic Completion Success, Resulted in ${text_blocks.length} Text Blocks`);
            return {
                __type: "string",
                payload: result
            };
        } catch (err: unknown) {
            Logger.info(req, "Anthropic Completion Error: ", err);
            throw err;
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Anthropic Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, path: string): Promise<HennosResponse> {
        Logger.warn(req, "Anthropic Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, path);
    }

    public async speech(req: HennosConsumer, input: string): Promise<HennosResponse> {
        Logger.warn(req, "Anthropic Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(req, input);
    }
}

function convertToolCallResponse(tools: Anthropic.Messages.ToolUseBlock[]): [ToolCall, Anthropic.Messages.ToolUseBlock][] {
    return tools.map((tool) => {
        try {
            return [{
                function: {
                    name: tool.name,
                    arguments: tool.input as Record<string, unknown>
                }
            }, tool];
        } catch {
            return [{
                function: {
                    name: tool.name,
                    arguments: {}
                }
            }, tool];
        }
    });
}

function calculateUsage(req: HennosConsumer, usage: Anthropic.Messages.Usage): string {
    return `Input: ${usage.input_tokens} tokens, Output: ${usage.output_tokens} tokens`;
}