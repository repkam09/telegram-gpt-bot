import { Tool } from "ollama";
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

export function availableTools(workflowId: string): Tool[] | undefined {
    const tools: Tool[] = [];

    AgentTools.forEach((Tool) => {
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
