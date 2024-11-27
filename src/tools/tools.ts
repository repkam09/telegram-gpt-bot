import { Tool, ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { OpenWeatherMapLookupTool } from "./OpenWeatherMapLookupTool";
import { QueryWebpageContent } from "./QueryWebpageContent";
import { HennosConsumer } from "../singletons/base";
import { TheNewsAPITool } from "./TheNewsAPITool";
import { ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { SearXNGSearch } from "./SearXNGSearchTool";
import { MetaBugReport } from "./MetaBugReport";
import { MetaFeatureRequest } from "./MetaFeatureRequest";
import { YoutubeVideoTool } from "./YoutubeVideoTool";
import { ReasoningModel } from "./Reasoning";
import { WolframAlpha } from "./WolframAlpha";
import { LastFMTool } from "./LastFMTool";
import { TheMovieDBTool } from "./TheMovieDBTool";
import { AcknowledgeWithoutResponse } from "./AcknowledgeWithoutResponse";
import { StoreKeyValueMemory } from "./UserFactsTool";
import { HomeAssistantEntitiesTool, HomeAssistantStatesTool } from "./HomeAssistantTool";
import { TransmissionActive } from "./TransmissionTools";

const PUBLIC_TOOLS = [
    SearXNGSearch,
    QueryWebpageContent
];

const WHITELIST_TOOLS = [
    MetaFeatureRequest,
    MetaBugReport,
    OpenWeatherMapLookupTool,
    TheNewsAPITool,
    LastFMTool,
    TheMovieDBTool,
    StoreKeyValueMemory,
];

const EXPERIMENTAL_AVAILABLE_TOOLS = [
    ReasoningModel,
    YoutubeVideoTool,
    WolframAlpha,
    AcknowledgeWithoutResponse,
];

const ADMIN_TOOLS = [
    HomeAssistantEntitiesTool,
    HomeAssistantStatesTool,
    TransmissionActive
];

export function availableTools(req: HennosConsumer): Tool[] | undefined {
    const tools: Tool[] = [];

    PUBLIC_TOOLS.forEach((Tool) => {
        if (Tool.isEnabled()) {
            tools.push(Tool.definition());
        }
    });

    if (req.allowFunctionCalling()) {
        WHITELIST_TOOLS.forEach((Tool) => {
            if (Tool.isEnabled()) {
                tools.push(Tool.definition());
            }
        });
    }

    if (req.experimental) {
        EXPERIMENTAL_AVAILABLE_TOOLS.forEach((Tool) => {
            if (Tool.isEnabled()) {
                tools.push(Tool.definition());
            }
        });
    }

    if (req.isAdmin()) {
        ADMIN_TOOLS.forEach((Tool) => {
            if (Tool.isEnabled()) {
                tools.push(Tool.definition());
            }
        });
    }

    Logger.debug(req, `Tools allowed for ${req.displayName}, there are ${tools.length} tools available: ${tools.map((tool) => tool.function.name).join(", ")}`);
    return tools.length > 0 ? tools : undefined;
}

export async function processToolCalls(req: HennosConsumer, tool_calls: [ToolCall, ToolCallMetadata][]): Promise<ToolCallResponse[]> {
    try {
        const results = await Promise.all(tool_calls.map(async ([tool_call, metadata]) => {
            const ToolMatch = [...PUBLIC_TOOLS, ...WHITELIST_TOOLS, ...EXPERIMENTAL_AVAILABLE_TOOLS, ...ADMIN_TOOLS].find((Tool) => Tool.functionName() === tool_call.function.name);
            if (!ToolMatch) {
                Logger.info(req, `Unknown tool call: ${tool_call.function.name}`);
                Logger.debug(req, `Unknown tool call: ${tool_call.function.name} with args: ${JSON.stringify(tool_call.function.arguments)}`);
                return [`Unknown tool call: ${tool_call.function.name}`, metadata] as [string, ToolCallMetadata];
            }

            ToolMatch.start(req, tool_call.function.arguments);
            return ToolMatch.callback(req, tool_call.function.arguments, metadata);
        }));

        return results;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(req, `Error processing tool calls: ${error.message}`);
    }

    return [];
}