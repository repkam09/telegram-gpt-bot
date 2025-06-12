import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";
import { HennosOpenAIProvider, HennosOpenAISingleton } from "../singletons/openai";
import { Config } from "../singletons/config";
import OpenAI, { OpenAIError } from "openai";
import { HennosResponse } from "../types";

export class ReasoningModel extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "query_reasoning_model",
                description: [
                    "This tool performs deep reasoning and research on complex queries, making it ideal for topics like math, science, logic, programming, and related areas.",
                    "Powered by advanced large language models trained with reinforcement learning, it provides in-depth responses by simulating a thoughtful reasoning process.",
                    "You should use this tool when the user asks for an explanation, reasoning, or detailed information on a complex topic.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The primary query to be addressed by the reasoning model. This can be the user's direct input or an enhanced version of it.",
                        },
                        context: {
                            type: "string",
                            description: "Additional relevant information from the current conversation that could improve the accuracy of the model's response.",
                        }
                    },
                    required: ["query"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.query) {
            return ["query_reasoning_model error, required parameter 'query' not provided", metadata];
        }

        Logger.info(req, "query_reasoning_model_callback", { query: args.query });
        try {
            const instance = HennosOpenAISingleton.instance();
            if (!(instance instanceof HennosOpenAIProvider)) {
                return ["query_reasoning_model error, openai instance not available", metadata];
            }

            Logger.info(req, `OpenAI Reasoning Completion Tool Start (${Config.OPENAI_LLM_REASONING.MODEL})`);

            let query = args.query;
            if (args.context) {
                query = `<context>\n${args.context}\n<context>\n\n${query}`;
            }

            const answer = await reasoningCompletion(req, instance, [
                {
                    role: "user",
                    content: query
                }
            ], 0);

            if (answer.__type !== "string") {
                Logger.error(req, "query_reasoning_model_callback error, expected string response", { query: args.query, answer: answer.__type });
                return [`query_reasoning_model error, expected string response from reasoning model but got ${answer.__type}`, metadata];
            }

            return [answer.payload, metadata, answer];
        } catch (err) {
            Logger.error(req, "query_reasoning_model_callback error", { query: args.query, error: err });
            const error = err as Error;
            return [`query_reasoning_model error. ${error.message}.`, metadata];
        }
    }
}

async function reasoningCompletion(req: HennosConsumer, provider: HennosOpenAIProvider, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[], depth: number): Promise<HennosResponse> {
    if (depth > Config.HENNOS_TOOL_DEPTH) {
        throw new Error("Tool Call Recursion Depth Exceeded");
    }

    try {
        const response = await provider.client.chat.completions.create({
            model: Config.OPENAI_LLM_REASONING.MODEL,
            messages: prompt,
        });

        Logger.info(req, `OpenAI Reasoning Completion Tool Success, Usage: ${calculateUsage(response.usage)} (depth=${depth})`);
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
                return reasoningCompletion(req, provider, prompt, depth + 1);
            }

            Logger.info(req, "OpenAI Completion Success, Resulted in Text Completion");
            return {
                __type: "string",
                payload: response.choices[0].message.content
            };
        }

        throw new Error("Invalid OpenAI Response Shape, Missing Expected Message Content");
    } catch (err: unknown) {
        Logger.error(req, "OpenAI Completion Error: ", err);

        if (err instanceof OpenAIError) {
            Logger.error(req, "OpenAI Error Response: ", err.message);
        }

        throw err;
    }
}

function calculateUsage(usage: OpenAI.Completions.CompletionUsage | undefined): string {
    if (!usage) {
        return "Unknown";
    }

    return `Input: ${usage.prompt_tokens} tokens, Output: ${usage.completion_tokens}, Thinking: ${usage.completion_tokens_details?.reasoning_tokens || 0} tokens`;
}