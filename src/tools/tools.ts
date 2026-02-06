import { Tool, ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { OpenWeatherMapLookupTool } from "./OpenWeatherMapLookupTool";
import { FetchWebpageContent } from "./FetchWebpageContent";
import { ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { SearXNGSearch } from "./SearXNGSearchTool";
import { MetaBugReport, MetaFeatureRequest, MetaFeedbackTool } from "./HennosMetaTools";
import { WolframAlpha } from "./WolframAlpha";
import { JellyseerMediaRequest, JellyseerMediaSearch } from "./JellyseerMediaRequest";
import { PythonSandbox } from "./PythonSandbox";
import { PerplexitySearch } from "./PerplexitySearch";
import { CreateArtifact } from "./CreateArtifact";
import { BraveSearch } from "./BraveSearch";
import { AudiobookRequest, EbookRequest } from "./MiscFileRequestTool";
import { HennosRetrieveArtifact } from "./HennosExternalArtifacts";

const PUBLIC_TOOLS = [
    SearXNGSearch,
    MetaFeedbackTool,
    MetaFeatureRequest,
    MetaBugReport,
    FetchWebpageContent,
    PerplexitySearch,
    OpenWeatherMapLookupTool,
    WolframAlpha,
    PythonSandbox,
    CreateArtifact,
    BraveSearch,
    JellyseerMediaRequest,
    JellyseerMediaSearch,
    AudiobookRequest,
    EbookRequest,
    HennosRetrieveArtifact
];

export function availableTools(workflowId: string): Tool[] | undefined {
    const tools: Tool[] = [];

    PUBLIC_TOOLS.forEach((Tool) => {
        if (Tool.isEnabled()) {
            tools.push(Tool.definition());
        }
    });

    Logger.debug(workflowId, `Tools allowed for ${workflowId}, there are ${tools.length} tools available: ${tools.map((tool) => tool.function.name).join(", ")}`);
    return tools.length > 0 ? tools : undefined;
}

export function availableToolsAsString(workflowId: string): string {
    const tools = availableTools(workflowId);
    if (!tools) {
        return "null";
    }

    return tools.map((tool) => `<tool><name>${tool.function.name}</name><description>${tool.function.description}</description><parameters>${JSON.stringify(tool.function.parameters)}</parameters></tool>`).join("\n");
}


export async function processToolCalls(workflowId: string, tool_calls: [ToolCall, ToolCallMetadata][]): Promise<ToolCallResponse[]> {
    try {
        const results = await Promise.all(tool_calls.map(async ([tool_call, metadata]) => {
            const ToolMatch = PUBLIC_TOOLS.find((Tool) => Tool.definition().function.name === tool_call.function.name);
            if (!ToolMatch) {
                Logger.info(workflowId, `Unknown tool call: ${tool_call.function.name}`);
                Logger.debug(workflowId, `Unknown tool call: ${tool_call.function.name} with args: ${JSON.stringify(tool_call.function.arguments)}`);
                return [`Unknown tool call: ${tool_call.function.name}`, metadata] as [string, ToolCallMetadata];
            }

            return ToolMatch.callback(workflowId, tool_call.function.arguments, metadata);
        }));

        return results;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `Error processing tool calls: ${error.message}`);
    }

    return [];
}