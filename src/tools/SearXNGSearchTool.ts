import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { FetchGenericURLTool } from "./FetchGenericURLTool";

export class SearXNGSearch extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "searxng_web_search",
                description: [
                    "This tool searches SearXNG for the provided query, which is a privacy-respecting search engine, that includes results from many other search engines.",
                    "The search results returned in an easily processed JSON format containing the result title, URL, brief content, and the engine that provided the result.",
                    "You should use this tool as often as possible to suppliment your own knowledge and provide the best possible answers to user queries.",
                    `This tool pairs well with the '${FetchGenericURLTool.definition().function.name}' tool, which can be used to fetch specific content using the URLs of the search results.`
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query",
                        },
                    },
                    required: ["query"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "SearXNGSearch callback", { query: args.query });
        if (!args.query) {
            return ["searxng_web_search, query not provided", metadata];
        }

        try {
            const json = await BaseTool.fetchJSONData<SearXNGSearchResult>("https://search.repkam09.com/search?format=json&q=" + encodeURI(args.query));
            if (!json.results) {
                return [`searxng_web_search, query '${args.query}', returned no results`, metadata];
            }

            Logger.debug("SearXNGSearch callback", { query: args.query, result_length: json.results.length });

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