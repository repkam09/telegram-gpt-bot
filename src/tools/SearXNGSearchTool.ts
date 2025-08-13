import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/consumer";
import { Config } from "../singletons/config";

export class SearXNGSearch extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.BRAVE_SEARCH_API_KEY) {
            return false;
        }

        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "searxng_web_search",
                description: [
                    "The SearXNG Search tool uses the SearXNG API, a privacy-respecting search engine, to get back search results from the web.",
                    "This tool takes in a search query and will return the top 8 search results. The results will include the page title, url, and description.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query to send to the SearXNG API.",
                        }
                    },
                    required: ["query"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "SearXNGSearch callback", { query: args.query });
        if (!args.query) {
            return ["searxng_web_search, query not provided", metadata];
        }

        try {
            const json = await BaseTool.fetchJSONData<SearXNGSearchResult>("https://search.repkam09.com/search?format=json&q=" + encodeURI(args.query));
            if (!json.results) {
                return [`searxng_web_search, query '${args.query}', returned no results`, metadata];
            }

            Logger.debug(req, "SearXNGSearch callback", { query: args.query, result_length: json.results.length });

            const limited = json.results.slice(0, 8);
            const cleaned = limited.map((result) => ({
                title: result.title,
                url: result.url,
                brief: result.content,
                engine: result.engine
            }));

            return [`searxng_web_search, query '${args.query}', returned the following results: ${JSON.stringify(cleaned)}`, metadata];
        } catch {
            Logger.error(req, "SearXNGSearch callback error", { query: args.query });
            return [`searxng_web_search, query '${args.query}', encountered an error while fetching results`, metadata];
        }
    }
}

type SearXNGSearchResult = {
    results: SearXNGSearchEntry[] | undefined
}

type SearXNGSearchEntry = {
    url: string;
    title: string;
    content: string;
    engine: string;
}