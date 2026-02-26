import { HennosBaseTool } from "../../tools/BaseTool";
import { BraveSearch } from "../../tools/BraveSearch";
import { Logger } from "../../singletons/logger";
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

export const LegacyTools: HennosBaseTool[] = [
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

export function availableTools(workflowId: string): HennosBaseTool[] | undefined {
    const tools: HennosBaseTool[] = [];

    LegacyTools.forEach((Tool) => {
        if (Tool.isEnabled()) {
            tools.push(Tool);
        }
    });

    Logger.debug(workflowId, `Tools allowed for ${workflowId}, there are ${tools.length} tools available: ${tools.map((tool) => tool.definition().function.name).join(", ")}`);
    return tools.length > 0 ? tools : undefined;
}