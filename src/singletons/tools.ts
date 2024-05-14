import OpenAI from "openai";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";
import { WebSearch } from "../tools/websearch";

export async function process_tool_calls(req: HennosUser | HennosGroup, tool_calls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]) {
    const results = await Promise.all(tool_calls.map(async (tool_call) => {
        try {
            const parsed = JSON.parse(tool_call.function.arguments);
            if (tool_call.function.name === "duck_duck_go_search") {
                const tool = new WebSearch(req, parsed, tool_call.id);
                return tool.process();
            }
        } catch (error) {
            return undefined;
        }
    }));

    return results.filter((tool_message): tool_message is OpenAI.Chat.Completions.ChatCompletionToolMessageParam => tool_message !== undefined);
}