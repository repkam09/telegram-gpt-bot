import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";

export class TheNewsAPITool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.THE_NEWS_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "top_news_stories",
                description: [
                    "This tool retrieves the latest top news stories globally or filters them by specific countries and categories.",
                    "The 'locale' parameter allows you to specify which countries' news to include using their country codes, with 'us' as the default.",
                    "The 'categories' parameter lets you filter news by topic, with supported categories including: general, science, sports, business, health, entertainment, tech, politics, food, and travel."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        locale: {
                            type: "string",
                            description: "A comma-separated list of country codes to specify which countries' news to include. Default is 'us'. For example, 'us,ca'."
                        },
                        categories: {
                            type: "string",
                            description: "A comma-separated list of categories to filter news by. Available categories: general, science, sports, business, health, entertainment, tech, politics, food, and travel. For example, 'business,tech'. Default is 'general'."
                        },
                    },
                    required: [],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.locale) {
            args.locale = "us";
        }

        if (!args.categories) {
            args.categories = "general";
        }

        Logger.info(req, "top_news_stories_tool_callback", { locale: args.locale, categories: args.categories });

        try {
            const url = `https://api.thenewsapi.com/v1/news/top?api_token=${Config.THE_NEWS_API_KEY}&locale=${args.locale}&categories=${args.categories}`;

            const result = await BaseTool.fetchJSONData(url);
            return [`Fetched the following top news stories for the locale ${args.locale}: ${JSON.stringify(result)}.`, metadata];

        } catch {
            Logger.error(req, "top_news_stories_tool_callback error", { locale: args.locale, categories: args.categories });
            return ["top_news_stories error, unable to fetch news stories at this time", metadata];
        }
    }
}