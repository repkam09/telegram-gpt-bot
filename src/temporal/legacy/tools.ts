import { HennosBaseTool } from "../../tools/BaseTool";
import { BraveSearch } from "../../tools/BraveSearch";
import { Logger } from "../../singletons/logger";
import { CreateArtifact } from "../../tools/CreateArtifact";
import { FetchWebpageContent } from "../../tools/FetchWebpageContent";
import { HennosRetrieveArtifact } from "../../tools/HennosExternalArtifacts";
import { MetaFeedbackTool, MetaFeatureRequest, MetaBugReport, MetaErrorTool } from "../../tools/HennosMetaTools";
import { JellyseerMediaRequest, JellyseerMediaSearch } from "../../tools/JellyseerMediaRequest";
import { AudiobookRequest, EbookRequest } from "../../tools/MiscFileRequestTool";
import { OpenWeatherMapLookupTool } from "../../tools/OpenWeatherMapLookupTool";
import { PythonSandbox } from "../../tools/PythonSandbox";
import { WolframAlpha } from "../../tools/WolframAlpha";
import { ImageGenerationTool } from "../../tools/ImageGenerationTool";
import { Config } from "../../singletons/config";
import { MemoryTool } from "../../tools/MemoryTool";

export const LegacyTools: HennosBaseTool[] = [
    MetaFeedbackTool,
    MetaFeatureRequest,
    MetaBugReport,
    FetchWebpageContent,
    OpenWeatherMapLookupTool,
    WolframAlpha,
    PythonSandbox,
    CreateArtifact,
    BraveSearch,
    JellyseerMediaRequest,
    JellyseerMediaSearch,
    AudiobookRequest,
    EbookRequest,
    HennosRetrieveArtifact,
    ImageGenerationTool,
    MemoryTool
];

export function availableTools(workflowId: string): HennosBaseTool[] | undefined {
    const tools: HennosBaseTool[] = [];

    LegacyTools.forEach((Tool) => {
        if (Tool.isEnabled()) {
            tools.push(Tool);
        } else {
            Logger.debug(workflowId, `Tool ${Tool.definition().function.name} is not enabled and will be skipped for ${workflowId}`);
        }
    });

    if (Config.HENNOS_DEVELOPMENT_MODE) {
        tools.push(MetaErrorTool);
    }

    Logger.debug(workflowId, `Tools allowed for ${workflowId}, there are ${tools.length} tools available: ${tools.map((tool) => tool.definition().function.name).join(", ")}`);
    return tools.length > 0 ? tools : undefined;
}