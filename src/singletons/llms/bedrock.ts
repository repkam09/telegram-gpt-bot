import { HennosBaseProvider } from "./base";
import { BedrockRuntimeClient, ContentBlock, ConverseCommand, Message, SystemContentBlock, TokenUsage, Tool, ToolConfiguration, ToolUseBlock } from "@aws-sdk/client-bedrock-runtime";
import { Config } from "../config";
import { HennosTextMessage, HennosMessage, HennosResponse, HennosStringResponse } from "../../types";
import { HennosConsumer } from "../consumer";
import { Logger } from "../logger";
import { HennosOpenAISingleton } from "./openai";
import { getSizedChatContext } from "../data/context";
import { availableTools, processToolCalls } from "../../tools/tools";
import { ToolCall } from "ollama";

export class HennosBedrockSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosBedrockSingleton._instance) {
            HennosBedrockSingleton._instance = new HennosBedrockProvider();
        }
        return HennosBedrockSingleton._instance;
    }
}

function getAvailableTools(req: HennosConsumer, depth: number): ToolConfiguration | undefined {
    if (depth > Config.HENNOS_TOOL_DEPTH) {
        Logger.warn(req, `OpenAI Tool Depth Limit Reached: ${depth}, No Tools Available`);
        return undefined;
    }

    const tools = availableTools(req);

    if (!tools) {
        return undefined;
    }

    const converted: Tool.ToolSpecMember[] = tools.map((tool) => ({
        toolSpec: {
            name: tool.function.name,
            description: tool.function.description || "No description provided",
            inputSchema: tool.function.parameters ? { json: tool.function.parameters } : undefined
        }
    }));

    return {
        toolChoice: {
            auto: {}
        },
        tools: converted
    };
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

        // The first message in the array MUST be from the user. Otherwise Bedrock will error out.

        Logger.debug(undefined, `Converted messages for Bedrock, resulted in ${converted.length} messages`);
        while (converted.length > 0 && converted[0].role !== "user") {
            Logger.debug(undefined, "Removing non-user message from start of conversation for Bedrock");
            converted.shift();
        }

        Logger.debug(undefined, `Final message count for Bedrock: ${converted.length}`);
        return converted;
    }

    public async invoke(req: HennosConsumer, messages: HennosTextMessage[]): Promise<HennosStringResponse> {
        Logger.warn(req, "Bedrock Invoke Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().invoke(req, messages);
    }

    public async completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Bedrock Completion Start with model ${Config.AWS_BEDROCK_LLM.MODEL}`);

        const trimmed = await getSizedChatContext(req, system, complete, Config.AWS_BEDROCK_LLM.CTX);

        const convertedMessages = this.convertMessages(trimmed);
        const convertedSystem: SystemContentBlock[] = [{
            text: system.map(s => s.content).join("\n")
        }];

        try {
            return this.completionWithRecursiveToolCalls(req, convertedSystem, convertedMessages, 0, true);
        } catch (err: unknown) {
            Logger.error(req, `Bedrock Completion with Tools Error: ${err}, Falling back to standard completion`);
            return HennosOpenAISingleton.instance().completion(req, system, complete);
        }
    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, system: SystemContentBlock[], prompt: Message[], depth: number, allow_tools: boolean): Promise<HennosResponse> {
        if (depth > Config.HENNOS_TOOL_DEPTH) {
            Logger.warn(req, `Bedrock Tool Depth Limit Reached: ${depth}, No Tools Available`);
            allow_tools = false;
        }

        try {
            const command = new ConverseCommand({
                modelId: Config.AWS_BEDROCK_LLM.MODEL,
                system,
                messages: prompt,
                toolConfig: getAvailableTools(req, depth),
            });

            const data = await this.client.send(command);

            Logger.info(req, `Bedrock Converse Success, Usage: ${calculateUsage(data.usage)}`);

            if (!data.output || !data.output.message || !data.output.message.content) {
                Logger.debug(req, "Bedrock Response Missing Output or Message, Full Response: ", data);
                throw new Error("Invalid Bedrock Response Shape, Missing Output Message Content");
            }

            // Remove any non 'toolUse' or 'text' blocks from the response, this is usually some metadata or reasoning tokens
            Logger.debug(req, `Bedrock Response Original Content Blocks: ${data.output.message.content.length}`);
            data.output.message.content = data.output.message.content.filter((block) => block.toolUse || block.text);
            Logger.debug(req, `Bedrock Response Filtered Content Blocks: ${data.output.message.content.length}`);

            if (data.stopReason === "content_filtered" || data.stopReason === "guardrail_intervened" || data.stopReason === "model_context_window_exceeded" || data.stopReason === "stop_sequence") {
                Logger.info(req, `Bedrock Completion Stopped: ${data.stopReason}`);
                throw new Error("Bedrock Completion Stopped");
            }

            // If the model stopped because it hit max tokens, we should call it again to continue
            if (data.stopReason === "max_tokens") {
                Logger.info(req, "Bedrock Max Tokens Reached, Continuing Completion");
                prompt.push({
                    role: "assistant",
                    content: [{
                        text: data.output.message.content[0].text!
                    }]
                });

                return this.completionWithRecursiveToolCalls(req, system, prompt, depth + 1, allow_tools);
            }

            if (data.stopReason === "end_turn") {
                Logger.info(req, "Bedrock Completion Success, Resulted in Text Completion");
                return {
                    __type: "string",
                    payload: data.output.message.content[0].text!
                };
            }

            if (data.stopReason == "tool_use") {
                const contents = data.output.message.content as ContentBlock[];
                if (!contents || contents.length === 0) {
                    throw new Error("Bedrock Tool Use Stopped but No Tools Provided");
                }

                const tools: ToolUseBlock[] = [];
                for (const content of contents) {
                    if (content.toolUse) {
                        tools.push(content.toolUse);
                    }
                }

                if (tools.length === 0) {
                    throw new Error("Bedrock Tool Use Stopped but No Tool Use Blocks Found");
                }

                Logger.info(req, `Bedrock Completion Success, Resulted in ${tools.length} Tool Calls`);
                prompt.push({
                    role: data.output.message.role,
                    content: tools.map((tool) => ({ toolUse: tool }))
                });

                const toolCalls = convertToolCallResponse(tools);
                const additional = await processToolCalls(req, toolCalls);

                const shouldEmptyResponse = additional.find(([, , response]) => response?.__type === "empty");
                if (shouldEmptyResponse) {
                    Logger.debug(req, "Bedrock Completion Requested Empty Response, Stopping Processing");
                    return {
                        __type: "empty"
                    };
                }

                const shouldStringResponse = additional.find(([, , response]) => response?.__type === "string");
                if (shouldStringResponse) {
                    Logger.debug(req, "Bedrock Completion Requested String Response, Stopping Processing");
                    return shouldStringResponse[2] as HennosResponse;
                }

                const convertedToolResultContent: ContentBlock[] = [];

                for (const [content, metadata] of additional) {
                    convertedToolResultContent.push({
                        toolResult: {
                            toolUseId: metadata.toolUseId,
                            content: [{
                                text: content
                            }]
                        }
                    });
                }

                prompt.push({
                    role: "user",
                    content: convertedToolResultContent
                });

                return this.completionWithRecursiveToolCalls(req, system, prompt, depth + 1, true);
            }

            throw new Error(`Bedrock Completion Stopped for Unknown Reason: ${data.stopReason}`);
        } catch (err: unknown) {
            Logger.info(req, "Bedrock Completion Error: ", err);
            throw err;
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

function calculateUsage(data?: TokenUsage): string {
    if (!data) {
        return "Unknown";
    }
    return `Prompt Tokens: ${data.inputTokens}, Completion Tokens: ${data.outputTokens}, Total Tokens: ${data.totalTokens}`;
}


function convertToolCallResponse(tools: ToolUseBlock[]): [ToolCall, ToolUseBlock][] {
    return tools.map((tool) => {
        if (!tool.name || !tool.toolUseId) {
            throw new Error("Invalid Tool Use Block, Missing Name or ToolUseId");
        }

        try {
            return [{
                function: {
                    name: tool.name,
                    arguments: tool.input as object
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
