import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "../../../tools/BaseTool";
import { Logger } from "../../../singletons/logger";
import { WiseOldMan } from "../wom";

export class GetGroupDetailsById extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "osrs_group_details_by_id",
                description: [
                    "Fetches a group's details by exact group ID. Includes membership information.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        groupId: {
                            type: "number",
                            description: "The ID of the group to fetch details for.",
                        },
                    },
                    required: ["groupId"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `GetGroupDetailsById callback, groupId=${args.groupId}`);
        if (!args.groupId) {
            return [JSON.stringify({ error: "groupId not provided" }), metadata];
        }

        try {
            const client = new WiseOldMan();
            const result = await client.getGroupDetailsById(args.groupId);
            return [JSON.stringify({ results: result }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `GetGroupDetailsById callback error, groupId=${args.groupId}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }
}