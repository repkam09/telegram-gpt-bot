import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/consumer";

export class HennosRetrieveArtifact extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "hennos_retrieve_artifact",
                description: [
                    "This tool retrieves and provides details about a specific external artifact. You can find artifacts by their unique IDs.",
                    "An artifact_id will be associated with a <external_artifact> entry in the context history.",
                    "External artifacts can include files, documents, or other resources that have been previously uploaded or referenced within the Hennos system."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        artifact_id: {
                            type: "string",
                            description: "The ID of the external artifact to retrieve details for.",
                        }
                    },
                    required: ["artifact_id"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.artifact_id) {
            return ["hennos_retrieve_artifact error, required parameter 'artifact_id' not provided", metadata];
        }

        Logger.info(req, `hennos_retrieve_artifact. ${JSON.stringify({ artifact_id: args.artifact_id })}`);

        return ["hennos_retrieve_artifact, unable to fetch artifact. This tool is coming soon and not yet implemented.", metadata];
    }
}
