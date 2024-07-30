import { Tool, ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { OpenWeatherMapLookupTool } from "./OpenWeatherMapLookupTool";
import { FetchGenericURLTool } from "./FetchGenericURLTool";
import { HennosConsumer } from "../singletons/base";
import { TheNewsAPITool } from "./TheNewsAPITool";
import { ToolCallMetadata } from "./BaseTool";
import { SearXNGSearch } from "./SearXNGSearchTool";

const AVAILABLE_TOOLS = [SearXNGSearch, OpenWeatherMapLookupTool, FetchGenericURLTool, TheNewsAPITool];

export function availableTools(req: HennosConsumer): Tool[] | undefined {
    if (!req.whitelisted) {
        return undefined;
    }

    if (!req.allowFunctionCalling()) {
        return undefined;
    }

    const tools: Tool[] = [];
    AVAILABLE_TOOLS.forEach((Tool) => {
        if (Tool.isEnabled()) {
            tools.push(Tool.definition());
        }
    });

    return tools.length > 0 ? tools : undefined;
}

export async function processToolCalls(req: HennosConsumer, tool_calls: [ToolCall, ToolCallMetadata][]): Promise<[string, ToolCallMetadata][]> {
    try {
        const results = await Promise.all(tool_calls.map(async ([tool_call, metadata]) => {
            const ToolMatch = AVAILABLE_TOOLS.find((Tool) => Tool.definition().function.name === tool_call.function.name);
            if (!ToolMatch) {
                Logger.info(req, `Unknown tool call: ${tool_call.function.name}`);
                Logger.debug(`Unknown tool call: ${tool_call.function.name} with args: ${JSON.stringify(tool_call.function.arguments)}`);
                return [`Unknown tool call: ${tool_call.function.name}`, metadata] as [string, ToolCallMetadata];
            }

            return ToolMatch.callback(req, tool_call.function.arguments, metadata);
        }));

        return results;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(req, `Error processing tool calls: ${error.message}`);
    }

    return [];
}