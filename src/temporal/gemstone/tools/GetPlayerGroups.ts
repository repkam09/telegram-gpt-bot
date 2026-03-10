import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "../../../tools/BaseTool";
import { Logger } from "../../../singletons/logger";
import { WiseOldMan } from "../wom";

export class GetPlayerGroups extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "osrs_player_groups",
                description: [
                    "Fetches the group memberships for a player, such as clans they are part of.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        username: {
                            type: "string",
                            description: "The username of the player to fetch group memberships for.",
                        },
                    },
                    required: ["username"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `GetPlayerGroups callback, username=${args.username}`);
        if (!args.username) {
            return [JSON.stringify({ error: "username not provided" }), metadata];
        }

        try {
            const client = new WiseOldMan();
            const result = await client.getPlayerGroups(args.username);
            return [JSON.stringify({ results: result }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `GetPlayerGroups callback error, username=${args.username}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }
}