import { ChatCompletionTool } from "openai/resources";
import { HennosBaseTool } from "./tool";
import { HennosUser } from "../singletons/user";
import { HennosGroup } from "../singletons/group";
import { Logger } from "../singletons/logger";
import { convert } from "html-to-text";
import OpenAI from "openai";
import axios from "axios";

type WebSearchArguments = {
    query: string;
};

export class WebSearch implements HennosBaseTool {
    private req: HennosUser | HennosGroup;
    private tool_id: string;
    private args: WebSearchArguments;

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

    constructor(req: HennosUser | HennosGroup, raw_arguments_json: string, tool_id: string) {
        if (!this.validate(raw_arguments_json)) {
            throw new Error("Invalid arguments");
        }

        this.req = req;
        this.tool_id = tool_id;
        this.args = raw_arguments_json;
    }

    public validate(parsed_json: unknown): parsed_json is WebSearchArguments {
        if (!parsed_json || typeof parsed_json !== "object") {
            return false;
        }

        if (!Object.prototype.hasOwnProperty.call(parsed_json, "query")) {
            return false;
        }

        return true;
    }

    public async process(): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
        Logger.info(this.req, "WebSearch callback for", { query: this.args.query });
        const result = await fetch_search_results(this.args.query);
        return {
            role: "tool",
            content: `DuckDuckGo Search Results: ${result}`,
            tool_call_id: this.tool_id
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

export async function getHTMLSearchResults(url: string): Promise<string> {
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
