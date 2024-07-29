import { convert } from "html-to-text";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { FetchGenericURLTool } from "./FetchGenericURLTool";

export class DuckDuckGoSearch extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "duck_duck_go_search",
                description: [
                    "This tool searches DuckDuckGo for the provided query.",
                    "The search results are converted from raw HTML into text and the first five results are returned as a result of this tool call.",
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
        Logger.info(req, "DuckDuckGoSearch callback", { query: args.query });
        if (!args.query) {
            return ["duck_duck_go_search, query not provided", metadata];
        }

        try {
            const html = await BaseTool.fetchTextData("https://html.duckduckgo.com/html/?q=" + args.query);
            const converted = convert(html, {
                wordwrap: 130,
                selectors: [
                    { selector: "select", format: "skip" },
                    { selector: "option", format: "skip" },
                    { selector: "a", options: { ignoreHref: true } },
                    { selector: "img", format: "skip" }
                ]
            });

            const convertedLines = converted.split("\n\n\n");
            if (convertedLines.length > 5) {
                return [`duck_duck_go_search, query '${args.query}', returned the following results: ${convertedLines.slice(0, 5).join("\n\n\n")}`, metadata];
            } else {
                return [`duck_duck_go_search, query '${args.query}', returned the following results: ${converted}`, metadata];
            }
        } catch (err) {
            Logger.error(req, "DuckDuckGoSearch callback error", { query: args.query });
            return [`duck_duck_go_search, query '${args.query}', unable fetch search results`, metadata];
        }
    }
}
