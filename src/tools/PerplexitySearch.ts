import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import OpenAI from "openai";
import { Config } from "../singletons/config";

type PerplexityResponse = OpenAI.Chat.Completions.ChatCompletion & {
    citations: string[]
}

export class PerplexitySearch extends BaseTool {
    public static isEnabled(): boolean {
        return Config.PERPLEXITY_API_KEY !== false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "perplexity_web_search",
                description: [
                    "This core tool performs web searches through Perplexity, an AI-powered search engine. It can be used to get information, answers, and insights from the web along with verified sources.",
                    "You should prompt Perplexity with a question or search query, and it will return the most relevant information. You can then use this information to answer the user's question or provide additional context.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The question or search query to ask Perplexity.",
                        }
                    },
                    required: ["query"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "PerplexitySearch callback", { query: args.query });
        if (!args.query) {
            return ["Error: Invalid Request, missing 'query'.", metadata];
        }

        try {
            const perplexity = new OpenAI({
                baseURL: "https://api.perplexity.ai",
                apiKey: Config.PERPLEXITY_API_KEY as string,
            });

            const result = await perplexity.chat.completions.create({
                model: Config.PERPLEXITY_MODEL,
                messages: [{
                    role: "system",
                    content: `You are a helpful AI assistant.

Rules:
1. Provide only the final answer. It is important that you do not include any explanation on the steps below.
2. Do not show the intermediate steps information.

Steps:
1. Decide if the answer should be a brief sentence or a list of suggestions.
2. If it is a list of suggestions, first, write a brief and natural introduction based on the original query.
3. Followed by a list of suggestions, each suggestion should be split by two newlines.

You should respond using only plain text with no markdown or code blocks.
`
                },
                {
                    role: "user",
                    content: args.query,
                }],
                stream: false
            }) as PerplexityResponse;

            if (!result.choices || result.choices.length === 0) {
                Logger.warn(req, "Perplexity returned no choices", { query: args.query });
                return ["Error: Perplexity returned an unexpected response.", metadata];
            }

            if (!result.choices[0].message || !result.choices[0].message.content) {
                Logger.warn(req, "Perplexity returned no content", { query: args.query });
                return ["Error: Perplexity returned an unexpected response.", metadata];
            }

            const resultCitations = result.citations && result.citations.length > 0 ? result.citations : [];
            const citations = resultCitations.map((citation, index) => `[${index + 1}]  ${citation}`).join("\n");

            const content = result.choices[0].message.content;
            return [`${content}\n\nSources:\n${citations}`, metadata];
        } catch {
            Logger.error(req, "Perplexity callback error", { query: args.query });
            return ["An Unhandled Error occured while attempting to use Perplexity.", metadata];
        }
    }
}
