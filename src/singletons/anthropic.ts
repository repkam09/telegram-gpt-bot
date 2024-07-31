import fs from "node:fs/promises";
import { Config } from "./config";
import { Anthropic } from "@anthropic-ai/sdk";
import { HennosUser } from "./user";
import { Message, ToolCall } from "ollama";
import { MessageParam, TextBlock, Tool } from "@anthropic-ai/sdk/resources";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosOpenAISingleton } from "./openai";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { ALL_AVAILABLE_ANTHROPIC_MODELS } from "llamaindex";
import { availableTools, processToolCalls } from "../tools/tools";

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


function getAvailableTools(req: HennosConsumer): [
    Anthropic.Messages.MessageCreateParams.ToolChoiceAuto | undefined,
    Tool[] | undefined
] {
    if (!req.whitelisted) {
        Logger.debug(`Tools disabled for ${req.displayName} because they are not whitelisted`);
        return [undefined, undefined];
    }

    const tool_choice: Anthropic.Messages.MessageCreateParams.ToolChoiceAuto = {
        type: "auto"
    };

    const tools = availableTools(req);
    if (!tools) {
        Logger.debug(`Tools disabled for ${req.displayName} because no tools are available`);
        return [undefined, undefined];
    }

    const converted: Tool[] = tools.map((tool) => ({
        name: tool.function.name,
        input_schema: {
            ...tool.function.parameters,
            type: "object"
        }
    }));

    Logger.debug(`Tools enabled for ${req.displayName}`);
    return [tool_choice, converted];
}

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

        const messages = chat.map(
            (entry) => {
                if (entry.role === "system") {
                    // Anthropic doesn't support system messages in the middle of the conversation, so we need to convert them to assistant messages
                    return {
                        role: "assistant",
                        content: `SYSTEM_CONTEXT: ${entry.content}`
                    };
                }
                return entry;
            }).filter(
                (entry) => entry.role !== "system").reduce(
                    (acc: MessageParam[], current: Message, index: number) => {
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

        // The first message must also be a user message...
        if (messages[0].role === "assistant") {
            messages.shift();
        }
        const combinedSystemPrompt = system.map((message) => message.content).join("\n");
        return this.completionWithRecursiveToolCalls(req, combinedSystemPrompt, messages, 0);

    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, system: string, prompt: Anthropic.Messages.MessageParam[], depth: number): Promise<string> {
        if (depth > 4) {
            throw new Error("Tool Call Recursion Depth Exceeded");
        }

        try {
            const [tool_choice, tools] = getAvailableTools(req);

            Logger.debug("\n\n", JSON.stringify(prompt), "\n\n");

            const response = await this.anthropic.messages.create({
                system,
                model: Config.ANTHROPIC_LLM.MODEL,
                max_tokens: 4096,
                messages: prompt,
                tool_choice: tool_choice,
                tools: tools
            });

            Logger.info(req, `Anthropic Completion Success, Resulted in ${response.usage.output_tokens} output tokens`);
            const tool_blocks = response.content.filter((content) => content.type === "tool_use") as Anthropic.Messages.ToolUseBlock[];
            if (tool_blocks.length > 0) {
                Logger.info(req, `Anthropic Completion Success, Resulted in ${tool_blocks.length} Tool Calls`);
                const toolCalls = convertToolCallResponse(tool_blocks);
                const additional = await processToolCalls(req, toolCalls);

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

                return this.completionWithRecursiveToolCalls(req, system, prompt, depth + 1);
            }

            const text_blocks = response.content.filter((content) => content.type === "text") as TextBlock[];
            Logger.info(req, `Anthropic Completion Success, Resulted in ${text_blocks.length} Text Blocks`);

            const result = text_blocks.map((block) => block.text).join();
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

            const [tool_choice, tools] = getAvailableTools(req);

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
                ],
                tool_choice: tool_choice,
                tools: tools
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

function convertToolCallResponse(tools: Anthropic.Messages.ToolUseBlock[]): [ToolCall, Anthropic.Messages.ToolUseBlock][] {
    return tools.map((tool) => {
        try {
            return [{
                function: {
                    name: tool.name,
                    arguments: tool.input as Record<string, unknown>
                }
            }, tool];
        } catch (err) {
            return [{
                function: {
                    name: tool.name,
                    arguments: {}
                }
            }, tool];
        }
    });
}