import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
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
                    "Use this tool to find the latest top stories around the world or filter to get only top stories for specific countries and categories.",
                    "The locale parameter specifies the country codes to include in the result set. Default is 'us' only.",
                    "The categories parameter specifies the categories to include. Supported categories: general | science | sports | business | health | entertainment | tech | politics | food | travel."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        locale: {
                            type: "string",
                            description: "Comma separated list of country codes to include in the result set. Default is 'us'. Ex: us,ca"
                        },
                        categories: {
                            type: "string",
                            description: "Comma separated list of categories to include. Supported categories: general | science | sports | business | health | entertainment | tech | politics | food | travel. Ex: business,tech. Default is 'general'."
                        },
                    },
                    required: [],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
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

        } catch (err) {
            Logger.error(req, "top_news_stories_tool_callback error", { locale: args.locale, categories: args.categories });
            return ["top_news_stories error, unable to fetch news stories at this time", metadata];
        }
    }
}