import { ChatCompletionTool } from "openai/resources";
import { HennosBaseTool } from "./tool";
import { HennosUser } from "../singletons/user";
import { HennosGroup } from "../singletons/group";
import { Logger } from "../singletons/logger";
import { convert } from "html-to-text";
import OpenAI from "openai";

type WebSearchArguments = {
    query: string;
};

export class WebSearch extends HennosBaseTool {
    public static definition: ChatCompletionTool = {
        type: "function",
        function: {
            name: "duck_duck_go_search",
            description: "Search the web using DuckDuckGo",
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

    constructor(raw_arguments_json: string) {
        super(raw_arguments_json);
    }

    protected validate<WebSearchArguments>(parsed_json: unknown): parsed_json is WebSearchArguments {
        const parsed = parsed_json as any;
        if (!parsed || typeof parsed !== "object") {
            return false;
        }

        if (!parsed.query) {
            return false;
        }

        return true;
    }

    protected async callback<WebSearchArguments>(req: HennosUser | HennosGroup, tool_id: string, args: WebSearchArguments): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
        const result = await fetch_search_results(args.query);
        return {
            role: "tool",
            content: `DuckDuckGo Search Results: ${result}`,
            tool_call_id: tool_id
        };
    }
}

async function fetch_search_results(query: string): Promise<string> {
    Logger.debug("fetch_search_results", { query });
    const html = await getHTMLSearchResults("https://html.duckduckgo.com/html/?q=" + query);
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
        return convertedLines.slice(0, 5).join("\n\n\n");
    } else {
        return converted;
    }
}

async function getHTMLSearchResults(url: string): Promise<string> {
    const html = await axios({
        headers: {
            "User-Agent": "HennosBot/1.0"
        },
        method: "get",
        url: url,
        responseType: "text"
    });

    return html.data;
}
