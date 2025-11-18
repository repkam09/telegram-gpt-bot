import { createReadStream } from "node:fs";
import { Config, HennosModelConfig } from "../config";
import OpenAI, { OpenAIError } from "openai";
import { HennosConsumer, HennosGroup, HennosUser } from "../consumer";
import { ToolCall } from "ollama";
import { Logger } from "../logger";
import { ChatCompletionAssistantMessageParam, ChatCompletionUserMessageParam, FunctionDefinition } from "openai/resources";
import { getSizedChatContext } from "../data/context";
import { HennosBaseProvider } from "./base";
import { availableTools, processToolCalls } from "../../tools/tools";
import { HennosMessage, HennosResponse, HennosStringResponse, HennosTextMessage } from "../../types";

type MessageRoles = ChatCompletionUserMessageParam["role"] | ChatCompletionAssistantMessageParam["role"]

export class HennosOpenAISingleton {
    private static _instance: HennosBaseProvider | null = null;
    private static _mini: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosOpenAISingleton._instance) {
            HennosOpenAISingleton._instance = new HennosOpenAIProvider(Config.OPENAI_LLM);
        }
        return HennosOpenAISingleton._instance;
    }

    public static mini(): HennosBaseProvider {
        if (!HennosOpenAISingleton._mini) {
            HennosOpenAISingleton._mini = new HennosOpenAIProvider(Config.OPENAI_MINI_LLM);
        }
        return HennosOpenAISingleton._mini;
    }
}

function getAvailableTools(req: HennosConsumer, depth: number): [
    OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined,
    OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    boolean | undefined
] {
    if (depth > Config.HENNOS_TOOL_DEPTH) {
        Logger.warn(req, `OpenAI Tool Depth Limit Reached: ${depth}, No Tools Available`);
        return [undefined, undefined, undefined];
    }

    const tools = availableTools(req);

    if (!tools) {
        return [undefined, undefined, undefined];
    }

    const converted = tools.map((tool) => ({
        type: "function" as const,
        function: tool.function as FunctionDefinition,
    }));

    return ["auto", converted, true];
}

function convertToolCallResponse(tools: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]): [ToolCall, OpenAI.Chat.Completions.ChatCompletionMessageToolCall][] {
    return tools.map((tool) => {
        if (tool.type !== "function") {
            throw new Error("The requested tool call is not supported: " + tool.type);
        }

        try {
            return [{
                function: {
                    name: tool.function.name,
                    arguments: JSON.parse(tool.function.arguments)
                }
            }, tool];
        } catch {
            return [{
                function: {
                    name: tool.function.name,
                    arguments: {}
                }
            }, tool];
        }
    });
}

export class HennosOpenAIProvider extends HennosBaseProvider {
    public client: OpenAI;
    private model: HennosModelConfig;
    private moderationModel: string;
    private transcriptionModel: string;
    private speechModel: string;

    constructor(model: HennosModelConfig) {
        super();

        this.client = new OpenAI({
            apiKey: Config.OPENAI_API_KEY,
        });

        this.model = model;
        this.moderationModel = "omni-moderation-latest";
        this.transcriptionModel = "whisper-1";
        this.speechModel = "tts-1";
    }

    public details(): string {
        return `OpenAI GPT model ${this.model.MODEL}`;
    }

    public async invoke(req: HennosConsumer, messages: HennosTextMessage[]): Promise<HennosStringResponse> {
        Logger.info(req, `OpenAI Invoke Start (${this.model.MODEL})`);
        const prompt = convertHennosMessages(messages);

        const response = await this.client.chat.completions.create({
            model: this.model.MODEL,
            messages: prompt,
            safety_identifier: `${req.chatId}`
        });

        Logger.info(req, `OpenAI Invoke Success, Usage: ${calculateUsage(response.usage)}`);
        if (!response.choices && !response.choices[0]) {
            throw new Error("Invalid OpenAI Response Shape, Missing Expected Choices");
        }

        if (!response.choices[0].message.tool_calls && !response.choices[0].message.content) {
            throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Properties");
        }

        if (!response.choices[0].message.content) {
            throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Content");
        }

        Logger.info(req, "OpenAI Invoke Success, Resulted in Text Completion");
        return {
            __type: "string",
            payload: response.choices[0].message.content
        };
    }

    public async completion(req: HennosConsumer, system: HennosMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `OpenAI Completion Start (${this.model.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, this.model.CTX);
        const prompt = system.concat(chat);
        const messages = convertHennosMessages(prompt);
        return this.completionWithRecursiveToolCalls(req, messages, 0);
    }

    private async completionWithRecursiveToolCalls(req: HennosConsumer, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[], depth: number): Promise<HennosResponse> {
        const [tool_choice, tools, parallel_tool_calls] = getAvailableTools(req, depth);

        try {
            const response = await this.client.chat.completions.create({
                model: this.model.MODEL,
                messages: prompt,
                tool_choice,
                tools,
                parallel_tool_calls,
                safety_identifier: `${req.chatId}`
            });

            Logger.info(req, `OpenAI Completion Success, Usage: ${calculateUsage(response.usage)} (depth=${depth})`);
            if (!response.choices && !response.choices[0]) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Choices");
            }

            if (!response.choices[0].message.tool_calls && !response.choices[0].message.content) {
                throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Properties");
            }

            // If this is a normal response with no tool calling, return the content
            if (response.choices[0].message.content) {
                if (response.choices[0].finish_reason === "length") {
                    Logger.info(req, "OpenAI Completion Success, Resulted in Length Limit");
                    prompt.push({
                        role: "assistant",
                        content: response.choices[0].message.content
                    });
                    return this.completionWithRecursiveToolCalls(req, prompt, depth + 1);
                }

                Logger.info(req, "OpenAI Completion Success, Resulted in Text Completion");
                return {
                    __type: "string",
                    payload: response.choices[0].message.content
                };
            }

            // If the model asked for a tool call, process it and re-trigger the completion
            if (response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0) {
                Logger.info(req, `OpenAI Completion Success, Resulted in ${response.choices[0].message.tool_calls.length} Tool Calls`);
                prompt.push({
                    role: "assistant",
                    tool_calls: response.choices[0].message.tool_calls
                });

                const toolCalls = convertToolCallResponse(response.choices[0].message.tool_calls);
                const additional = await processToolCalls(req, toolCalls);

                const shouldEmptyResponse = additional.find(([, , response]) => response?.__type === "empty");
                if (shouldEmptyResponse) {
                    Logger.debug(req, "OpenAI Completion Requested Empty Response, Stopping Processing");
                    return {
                        __type: "empty"
                    };
                }

                const shouldStringResponse = additional.find(([, , response]) => response?.__type === "string");
                if (shouldStringResponse) {
                    Logger.debug(req, "OpenAI Completion Requested String Response, Stopping Processing");
                    return shouldStringResponse[2] as HennosResponse;
                }

                additional.forEach(([content, metadata]) => {
                    prompt.push({
                        role: "tool",
                        content: content,
                        tool_call_id: metadata.id
                    });
                });

                return this.completionWithRecursiveToolCalls(req, prompt, depth + 1);
            }

            throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Tool Calls");
        } catch (err: unknown) {
            Logger.error(req, "OpenAI Completion Error: ", err);

            if (err instanceof OpenAIError) {
                Logger.error(req, "OpenAI Error Response: ", err.message);
            }

            throw err;
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.info(req, "OpenAI Moderation Start");
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
            Logger.info(req, "OpenAI Moderation Success, Result: ", flagged ? "Blocked" : "Allowed", "Input:", input);
            return flagged;
        } catch (err: unknown) {
            Logger.error(req, "OpenAI Moderation Error: ", err);
            return false;
        }
    }

    public async transcription(req: HennosConsumer, path: string): Promise<HennosResponse> {
        Logger.info(req, "OpenAI Transcription Start");
        try {
            const transcription = await this.client.audio.transcriptions.create({
                model: this.transcriptionModel,
                file: createReadStream(path)
            });

            Logger.info(req, "OpenAI Transcription Success");
            return {
                __type: "string",
                payload: transcription.text
            };
        } catch (err: unknown) {
            Logger.error(req, "OpenAI Transcription Error: ", err);
            throw err;
        }
    }

    public async speech(req: HennosConsumer, input: string): Promise<HennosResponse> {
        Logger.info(req, "OpenAI Speech Start");

        if (req instanceof HennosGroup) {
            throw new Error("Speech API is not available for group chats");
        }

        const user = req as HennosUser;
        try {
            const preferences = await user.getPreferences();
            const result = await this.client.audio.speech.create({
                model: this.speechModel,
                voice: preferences.voice,
                input: input,
                response_format: "opus"
            });

            Logger.info(user, "OpenAI Speech Success");
            const buffer = await result.arrayBuffer();
            return {
                __type: "arraybuffer",
                payload: buffer
            };
        } catch (err: unknown) {
            Logger.error(user, "OpenAI Speech Error: ", err);
            throw err;
        }
    }
}

function calculateUsage(usage: OpenAI.Completions.CompletionUsage | undefined): string {
    if (!usage) {
        return "Unknown";
    }

    return `Input: ${usage.prompt_tokens} tokens, Output: ${usage.completion_tokens}`;
}

export function convertHennosMessages(messages: HennosMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text" && val.content && val.content.length > 0) {
            acc.push({
                role: val.role as MessageRoles,
                content: val.content
            });
        }

        if (val.type === "image") {
            acc.push({
                role: val.role as "user",
                content: [
                    {
                        type: "text",
                        text: `Image: ${val.image.local}`
                    },
                    {
                        type: "image_url",
                        image_url: {
                            detail: "auto",
                            url: `data:${val.image.mime};base64,${val.encoded}`
                        }
                    }]
            });
        }
        return acc;
    }, [] as OpenAI.Chat.Completions.ChatCompletionMessageParam[]);
}
