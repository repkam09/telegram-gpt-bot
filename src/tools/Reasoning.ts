import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";
import { HennosOpenAIProvider, HennosOpenAISingleton } from "../singletons/openai";
import { Config } from "../singletons/config";

export class ReasoningModel extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "query_reasoning_model",
                description: [
                    "This tool performs deep reasoning and research on complex queries, making it ideal for topics like math, science, logic, programming, and related areas.",
                    "Powered by advanced large language models trained with reinforcement learning, it provides in-depth responses by simulating a thoughtful reasoning process.",
                    "These models generate comprehensive answers by following a detailed internal chain of thought before formulating a response for the user."
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

            Logger.info(req, `OpenAI Completion Tool Start (${Config.OPENAI_LLM_REASONING.MODEL})`);

            let query = args.query;
            if (args.context) {
                query = `<context>\n${args.context}\n<context>\n\n${query}`;
            }

            const response = await instance.openai.chat.completions.create({
                model: Config.OPENAI_LLM_REASONING.MODEL,
                messages: [
                    {
                        role: "user",
                        content: query
                    }
                ],
            });

            Logger.info(req, `OpenAI Completion Tool Success, Resulted in ${response.usage?.completion_tokens} output tokens`);

            if (!response.choices || !response.choices[0]) {
                return ["query_reasoning_model error, invalid response shape", metadata];
            }

            if (!response.choices[0].message.content) {
                return ["query_reasoning_model error, invalid response shape", metadata];
            }

            Logger.info(req, "OpenAI Completion Tool Success, Resulted in Text Completion");
            const answer = response.choices[0].message.content;
            return [`'${args.query}': ${answer}`, metadata];
        } catch (err) {
            Logger.error(req, "query_reasoning_model_callback error", { query: args.query, error: err });
            const error = err as Error;
            return [`query_reasoning_model error. ${error.message}.`, metadata];
        }
    }
}
