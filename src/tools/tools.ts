import { Tool, ToolCall } from "ollama";
import { Logger } from "../singletons/logger";
import { OpenWeatherMapLookupTool } from "./OpenWeatherMapLookupTool";
import { FetchWebpageContent } from "./FetchWebpageContent";
import { ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { SearXNGSearch } from "./SearXNGSearchTool";
import { MetaBugReport, MetaFeatureRequest, MetaFeedbackTool } from "./HennosMetaTools";
import { WolframAlpha } from "./WolframAlpha";
import { AcknowledgeWithoutResponse } from "./AcknowledgeWithoutResponse";
import { HomeAssistantEntitiesTool, HomeAssistantStatesTool } from "./HomeAssistantTool";
import { ImageGenerationTool } from "./ImageGenerationTool";
import { JellyseerMediaRequest, JellyseerMediaSearch } from "./JellyseerMediaRequest";
import { PythonSandbox } from "./PythonSandbox";
import { PerplexitySearch } from "./PerplexitySearch";
import { HennosConsumer } from "../singletons/consumer";
import { CreateArtifact } from "./CreateArtifact";
import { SendImageFromURL } from "./SendImageFromURL";
import { BraveSearch } from "./BraveSearch";

const PUBLIC_TOOLS = [
    SearXNGSearch,
    MetaFeedbackTool,
    MetaFeatureRequest,
    MetaBugReport
];

const WHITELIST_TOOLS = [
    FetchWebpageContent,
    PerplexitySearch,
    OpenWeatherMapLookupTool,
    WolframAlpha,
    PythonSandbox,
    AcknowledgeWithoutResponse,
    ImageGenerationTool,
    CreateArtifact,
    SendImageFromURL,
    BraveSearch
];

const EXPERIMENTAL_AVAILABLE_TOOLS = [
    JellyseerMediaRequest,
    JellyseerMediaSearch
];

const ADMIN_TOOLS = [
    HomeAssistantEntitiesTool,
    HomeAssistantStatesTool,
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