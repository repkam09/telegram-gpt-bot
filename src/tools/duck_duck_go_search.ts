import axios from "axios";
import { convert } from "html-to-text";
import OpenAI from "openai";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Message } from "ollama";
import { ToolEntries } from "./tools";

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

export const duck_duck_go_search_tool_callback = async (req: HennosConsumer, tool_entry: ToolEntries): Promise<Message | undefined> => {
    if (!tool_entry.args.query) {
        return undefined;
    }

    Logger.info(req, "duck_duck_go_search_tool_callback", { query: tool_entry.args.query });
    const result = await fetch_search_results(tool_entry.args.query);
    return {
        role: "system",
        content: `DuckDuckGo Search Results for ${tool_entry.args.query}: ${result}`,
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
