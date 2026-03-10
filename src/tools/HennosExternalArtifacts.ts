import path from "node:path";
import fs from "node:fs/promises";

import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { handleDocument } from "./FetchWebpageContent";
import { FILE_EXT_TO_READER } from "@llamaindex/readers/directory";


export class HennosRetrieveArtifact extends BaseTool {
    public static isEnabled(): boolean {
        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "hennos_retrieve_artifact",
                description: [
                    "This tool retrieves and provides details about a specific external artifact. You can find artifacts by their unique IDs.",
                    "External artifacts can include files, documents, or other resources that have been previously uploaded or referenced within the Hennos system."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        artifact_id: {
                            type: "string",
                            description: "The ID of the external artifact to retrieve details for.",
                        },
                        query: {
                            type: "string",
                            description: "A query to run against the artifact content.",
                        }
                    },
                    required: ["artifact_id", "query"],
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.artifact_id) {
            return [JSON.stringify({ error: "required parameter 'artifact_id' not provided" }), metadata];
        }

        if (!args.query) {
            return [JSON.stringify({ error: "required parameter 'query' not provided" }), metadata];
        }

        Logger.info(workflowId, `hennos_retrieve_artifact. ${JSON.stringify({ artifact_id: args.artifact_id, query: args.query })}`);

        const expectedPath = path.join(Config.LOCAL_STORAGE(workflowId), `${args.artifact_id}`);
        const fileExists = await fs.access(expectedPath).then(() => true).catch(() => false);
        if (!fileExists) {
            Logger.error(workflowId, `hennos_retrieve_artifact error. Artifact with ID '${args.artifact_id}' not found at expected path: ${expectedPath}`);
            return [JSON.stringify({ error: `artifact with ID '${args.artifact_id}' not found` }), metadata];
        }


        const ext = path.extname(expectedPath) ? path.extname(expectedPath).substring(1) : ".bin";
        const reader = FILE_EXT_TO_READER[ext];
        if (!reader) {
            Logger.error(workflowId, `hennos_retrieve_artifact error. No reader available for file extension '${ext}' of artifact with ID '${args.artifact_id}' at path: ${expectedPath}`);
            return [JSON.stringify({ error: `no reader available for file extension '${ext}'` }), metadata];
        }
        const result = await handleDocument(workflowId, expectedPath, args.artifact_id, reader, args.query);
        return [JSON.stringify({ query_result: result }), metadata];
    }
}
