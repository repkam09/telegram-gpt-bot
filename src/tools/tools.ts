import { Tool, ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { OpenWeatherMapLookupTool } from "./OpenWeatherMapLookupTool";
import { QueryWebpageContent } from "./QueryWebpageContent";
import { HennosConsumer } from "../singletons/base";
import { ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { SearXNGSearch } from "./SearXNGSearchTool";
import { MetaBugReport, MetaDevelopmentThrowError, MetaFeatureRequest, MetaFeedbackTool } from "./HennosMetaTools";
import { YoutubeVideoTool } from "./YoutubeVideoTool";
import { WolframAlpha } from "./WolframAlpha";
import { AcknowledgeWithoutResponse } from "./AcknowledgeWithoutResponse";
import { HomeAssistantEntitiesTool, HomeAssistantStatesTool } from "./HomeAssistantTool";
import { ScheduleMessageCallback } from "./MessageCallback";
import { ImageGenerationTool } from "./ImageGenerationTool";
import { JellyseerMediaRequest, JellyseerMediaSearch } from "./JellyseerMediaRequest";
import { PythonSandbox } from "./PythonSandbox";
import { Base64Decode } from "./Base64Decode";
import { PerplexitySearch } from "./PerplexitySearch";
import { VideoGenerationTool } from "./VideoGenerationTool";

const PUBLIC_TOOLS = [
    SearXNGSearch,
    MetaFeedbackTool,
    MetaFeatureRequest,
    MetaBugReport
];

const WHITELIST_TOOLS = [
    QueryWebpageContent,
    PerplexitySearch,
    OpenWeatherMapLookupTool,
    ScheduleMessageCallback,
    WolframAlpha,
    PythonSandbox,
    Base64Decode
];

const EXPERIMENTAL_AVAILABLE_TOOLS = [
    YoutubeVideoTool,
    AcknowledgeWithoutResponse,
    ImageGenerationTool,
    JellyseerMediaRequest,
    JellyseerMediaSearch,
];

const ADMIN_TOOLS = [
    HomeAssistantEntitiesTool,
    HomeAssistantStatesTool,
    MetaDevelopmentThrowError,
    VideoGenerationTool
];

export function availableTools(req: HennosConsumer): Tool[] | undefined {
    if (req.chatId === -1) {
        return undefined;
    }

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
            const ToolMatch = [...PUBLIC_TOOLS, ...WHITELIST_TOOLS, ...EXPERIMENTAL_AVAILABLE_TOOLS, ...ADMIN_TOOLS].find((Tool) => Tool.definition().function.name === tool_call.function.name);
            if (!ToolMatch) {
                Logger.info(req, `Unknown tool call: ${tool_call.function.name}`);
                Logger.debug(req, `Unknown tool call: ${tool_call.function.name} with args: ${JSON.stringify(tool_call.function.arguments)}`);
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