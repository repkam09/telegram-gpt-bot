import OpenAI from "openai";
import axios from "axios";
import { convert } from "html-to-text";
import { Logger } from "./logger";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";

export async function process_tool_calls(req: HennosUser | HennosGroup, tool_calls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]) {
    const results = await Promise.all(tool_calls.map(async (tool_call) => {
        try {
            const parsed = JSON.parse(tool_call.function.arguments);
            if (tool_call.function.name === "duck_duck_go_search") {
                return duck_duck_go_search_tool_callback(req, tool_call.id, parsed);
            }
        } catch (error) {
            return undefined;
        }
    }));

    return results.filter((tool_message): tool_message is OpenAI.Chat.Completions.ChatCompletionToolMessageParam => tool_message !== undefined);
}


export const duck_duck_go_search_tool: OpenAI.Chat.Completions.ChatCompletionTool = {
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

export const duck_duck_go_search_tool_callback = async (req: HennosUser | HennosGroup, tool_id: string, parsed_json: any): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> => {
    Logger.info(req, "duck_duck_go_search_tool_callback", { tool_id, parsed_json });
    if (!parsed_json || !parsed_json.query) {
        return {
            role: "tool",
            content: "Sorry, I was unable to process your search request.",
            tool_call_id: tool_id
        };
    }

    const result = await fetch_search_results(parsed_json.query);
    return {
        role: "tool",
        content: `DuckDuckGo Search Results: ${result}`,
        tool_call_id: tool_id
    };
};

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
