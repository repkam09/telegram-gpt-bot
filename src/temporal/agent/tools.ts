import { HennosBaseTool } from "../../tools/BaseTool";
import { Logger } from "../../singletons/logger";
import { BraveSearch } from "../../tools/BraveSearch";
import { CreateArtifact } from "../../tools/CreateArtifact";
import { FetchWebpageContent } from "../../tools/FetchWebpageContent";
import { HennosRetrieveArtifact } from "../../tools/HennosExternalArtifacts";
import { MetaFeedbackTool, MetaFeatureRequest, MetaBugReport } from "../../tools/HennosMetaTools";
import { JellyseerMediaRequest, JellyseerMediaSearch } from "../../tools/JellyseerMediaRequest";
import { AudiobookRequest, EbookRequest } from "../../tools/MiscFileRequestTool";
import { OpenWeatherMapLookupTool } from "../../tools/OpenWeatherMapLookupTool";
import { PerplexitySearch } from "../../tools/PerplexitySearch";
import { PythonSandbox } from "../../tools/PythonSandbox";
import { WolframAlpha } from "../../tools/WolframAlpha";
import { parseWorkflowId } from "./interface";
import { workflowSessionMcpClient } from "../../singletons/mcp";

export const AgentTools: HennosBaseTool[] = [
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

export async function availableTools(workflowId: string): Promise<HennosBaseTool[] | undefined> {
    const tools: HennosBaseTool[] = [];

    AgentTools.forEach((Tool) => {
        if (Tool.isEnabled()) {
            tools.push(Tool);
        }
    });

    // Load the MCP tools for this workflow session and add them to the list of available tools
    const workflow = parseWorkflowId(workflowId);
    const client = await workflowSessionMcpClient(workflow.chatId);
    const mcpTools = client.getHennosTools();

    mcpTools.forEach((tool) => {
        tools.push(tool);
    });

    Logger.debug(workflowId, `Tools allowed for ${workflowId}, there are ${tools.length} tools available: ${tools.map((tool) => tool.definition().function.name).join(", ")}`);
    return tools.length > 0 ? tools : undefined;
}

export async function availableToolsAsString(workflowId: string): Promise<string> {
    const tools = await availableTools(workflowId);
    if (!tools) {
        return "null";
    }

    return tools.map((tool) => `<tool><name>${tool.definition().function.name}</name><description>${tool.definition().function.description}</description><parameters>${JSON.stringify(tool.definition().function.parameters)}</parameters></tool>`).join("\n");
}
