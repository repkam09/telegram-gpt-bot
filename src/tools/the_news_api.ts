import axios from "axios";
import OpenAI from "openai";
import { Logger } from "../singletons/logger";
import { Message } from "ollama";
import { ToolEntries } from "./tools";
import { Config } from "../singletons/config";
import { HennosUser } from "../singletons/user";

export const top_news_stories_tool: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: "function",
    function: {
        name: "top_news_stories",
        description: "Use this tool to find up to date top news stories around the world.",
        parameters: {
            type: "object",
            properties: {
                locale: {
                    type: "string",
                    description: "Comma separated list of country codes to include in the result set. Default is all countries. Click here for a list of supported countries. Ex: us,ca"
                },
                categories: {
                    type: "string",
                    description: "Comma separated list of categories to include. Supported categories: general | science | sports | business | health | entertainment | tech | politics | food | travel. Ex: business,tech"
                },
            },
            required: [],
        }
    }
};

export type TopNewsStoriesToolArgs = {
    locale?: string,
    categories?: string
};

export const top_news_stories_tool_callback = async (req: HennosUser, tool_entry: ToolEntries<TopNewsStoriesToolArgs>): Promise<Message | undefined> => {
    let locale;
    if (tool_entry.args.locale) {
        locale = `&locale=${tool_entry.args.locale}`;
    } else {
        locale = "&locale=us";
    }

    let categories;
    if (tool_entry.args.categories) {
        categories = `&categories=${tool_entry.args.categories}`;
    } else {
        categories = "";
    }

    Logger.info(req, "top_news_stories_tool_callback", { locale: tool_entry.args.locale, categories: tool_entry.args.categories });

    if (!Config.THE_NEWS_API_KEY) {
        return {
            role: "system",
            content: "The News API is not available as there is not an API key configured."
        };
    }

    const url = `https://api.thenewsapi.com/v1/news/top?api_token=${Config.THE_NEWS_API_KEY}${locale}${categories}`;

    const json = await getJSON(url);
    return {
        role: "system",
        content: `Fetched the following top news stories for the locale ${tool_entry.args.locale}: ${JSON.stringify(json)}. If you use this data in your response try to include the URL to the source of the information, if available.`,
    };
};

export async function getJSON(url: string): Promise<string> {
    const json = await axios({
        headers: {
            "User-Agent": "HennosBot/1.0"
        },
        method: "get",
        url: url,
        responseType: "json"
    });

    return json.data;
}
