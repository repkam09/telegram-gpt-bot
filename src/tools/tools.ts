import { Tool, ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { DuckDuckGoSearch } from "./DuckDuckGoSearch";
import { OpenWeatherMapLookupTool } from "./OpenWeatherMapLookupTool";
import { FetchGenericURLTool } from "./FetchGenericURLTool";
import { HennosConsumer } from "../singletons/base";
import { TheNewsAPITool } from "./TheNewsAPITool";
import { ToolCallMetadata } from "./BaseTool";

export function availableTools(req: HennosConsumer): Tool[] | undefined {
    if (!req.whitelisted) {
        return undefined;
    }

    if (!req.allowFunctionCalling()) {
        return undefined;
    }

    const tools = [];

    if (DuckDuckGoSearch.isEnabled()) {
        tools.push(DuckDuckGoSearch.definition());
    }

    if (OpenWeatherMapLookupTool.isEnabled()) {
        tools.push(OpenWeatherMapLookupTool.definition());
    }

    if (FetchGenericURLTool.isEnabled()) {
        tools.push(FetchGenericURLTool.definition());
    }

    if (TheNewsAPITool.isEnabled()) {
        tools.push(TheNewsAPITool.definition());
    }

    return tools.length > 0 ? tools : undefined;
}

export async function processToolCalls(req: HennosConsumer, tool_calls: [ToolCall, ToolCallMetadata][]): Promise<[string, ToolCallMetadata][]> {
    try {
        const results = await Promise.all(tool_calls.map(async ([tool_call, metadata]) => {
            if (tool_call.function.name === "duck_duck_go_search") {
                return DuckDuckGoSearch.callback(req, tool_call.function.arguments, metadata);
            }

            if (tool_call.function.name === "open_weather_map_lookup") {
                return OpenWeatherMapLookupTool.callback(req, tool_call.function.arguments, metadata);
            }

            if (tool_call.function.name === "fetch_generic_url") {
                return FetchGenericURLTool.callback(req, tool_call.function.arguments, metadata);
            }

            if (tool_call.function.name === "top_news_stories") {
                return TheNewsAPITool.callback(req, tool_call.function.arguments, metadata);
            }

            Logger.info(req, `Unknown tool call: ${tool_call.function.name}`);
            Logger.debug(`Unknown tool call: ${tool_call.function.name} with args: ${JSON.stringify(tool_call.function.arguments)}`);
            return [`Unknown tool call: ${tool_call.function.name}`, metadata] as [string, ToolCallMetadata];
        }));

        return results;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(req, `Error processing tool calls: ${error.message}`);
    }

    return [];
}