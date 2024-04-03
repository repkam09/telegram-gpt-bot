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
