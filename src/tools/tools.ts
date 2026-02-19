import { ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { HennosBaseTool, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export async function processDefinedToolCalls(workflowId: string, defined_tools: HennosBaseTool[], tool_calls: [ToolCall, ToolCallMetadata][]): Promise<ToolCallResponse[]> {
    try {
        const results = await Promise.all(tool_calls.map(async ([tool_call, metadata]) => {
            const ToolMatch = defined_tools.find((Tool) => Tool.definition().function.name === tool_call.function.name);
            if (!ToolMatch) {
                Logger.info(workflowId, `Unknown tool call: ${tool_call.function.name}`);
                Logger.debug(workflowId, `Unknown tool call: ${tool_call.function.name} with args: ${JSON.stringify(tool_call.function.arguments)}`);
                return [`Unknown tool call: ${tool_call.function.name}`, metadata] as [string, ToolCallMetadata];
            }

            Logger.info(workflowId, `Processing tool call: ${tool_call.function.name}`);
            return ToolMatch.callback(workflowId, tool_call.function.arguments, metadata);
        }));

        return results;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `Error processing tool calls: ${error.message}`);
    }

    return [];
}