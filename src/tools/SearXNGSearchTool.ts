import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export class SearXNGSearch extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "searxng_web_search",
                description: [
                    "This core tool performs web searches through SearXNG, a privacy-respecting search engine that aggregates results from multiple sources.",
                    "It provides search results in a JSON format, including the result title, URL, brief content, and originating search engine.",
                    "This tool should be your go-to method for obtaining up-to-date and comprehensive external information, to enhance the accuracy and relevance of your responses.",
                    "It is particularly useful for initial queries to gather broad insights that supplement your existing knowledge base.",
                    "For deeper exploration, pair this tool with the 'query_webpage_content' tool to extract specific content from the URLs provided in the search results."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query",
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
        } catch (err) {
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