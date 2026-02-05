import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";

export class BraveSearch extends BaseTool {

    private static readonly RESULTS_COUNT = 5;

    public static isEnabled(): boolean {
        if (Config.BRAVE_SEARCH_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "brave_search",
                description: [
                    "The Brave Search tool uses the Brave Search API to get back search results from the web.",
                    "This tool takes in a search query and will return the top 5 search results. The results will include the page title, url, description, language, and age.",
                    "Brave can take an optional 'resource' which will focus the search to either Web, Images, News, or Video results."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        resource: {
                            type: "string",
                            enum: ["web", "images", "news", "videos"],
                            description: "The type of search results to return. The default is 'web'.",
                        },
                        query: {
                            type: "string",
                            description: "The search query to send to the Brave Search API.",
                        }
                    },
                    required: ["query"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `Brave callback, query=${args.query}, resource=${args.resource}`);
        if (!args.query) {
            return ["brave_search, query not provided", metadata];
        }

        const resource = args.resource || "web";
        if (!["web", "images", "news", "videos"].includes(resource)) {
            return [`brave_search, invalid resource '${resource}' provided. Expected one of: web, images, news, videos`, metadata];
        }

        try {
            const body = await BraveSearch.searchResults({ query: args.query, resource: resource });
            return [`brave_search, query '${args.query}', returned the following results: ${JSON.stringify(body)}`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `BraveSearch callback error, query=${args.query}`, error);
            return [`brave_search, query '${args.query}', encountered an error while fetching results`, metadata];
        }
    }

    static async searchResults(args: { query: string; resource: string; }): Promise<Array<object>> {
        let params = new URLSearchParams();

        switch (args.resource) {
            case "images":
                params = new URLSearchParams({
                    q: args.query,
                    safesearch: "off",
                    count: `${BraveSearch.RESULTS_COUNT}`
                });
                break;
            case "news":
                params = new URLSearchParams({
                    q: args.query,
                    safesearch: "off",
                    count: `${BraveSearch.RESULTS_COUNT}`
                });
                break;
            case "videos":
                params = new URLSearchParams({
                    q: args.query,
                    count: `${BraveSearch.RESULTS_COUNT}`
                });
                break;
            default:
                params = new URLSearchParams({
                    q: args.query,
                    count: `${BraveSearch.RESULTS_COUNT}`,
                    safesearch: "off",
                    extra_snippets: "true",
                    summary: "true"
                });
                break;
        }

        const response = await fetch(`https://api.search.brave.com/res/v1/${args.resource}/search?${params}`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "x-subscription-token": Config.BRAVE_SEARCH_API_KEY as string,
            },
        });

        const body = await response.json();
        return body;
    }
}