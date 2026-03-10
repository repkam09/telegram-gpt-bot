import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "../../../tools/BaseTool";
import { Logger } from "../../../singletons/logger";
import { WiseOldMan } from "../wom";

export class GetPlayerDetailsById extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "osrs_player_details_by_id",
                description: [
                    "Fetches a player's details by exact player ID. Returns a PlayerDetails object.",
                    WiseOldMan.PlayerDetailsDescription,
                    WiseOldMan.PlayerDetailsSnapshot,
                    WiseOldMan.PlayerDetailsSnapshotData
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        playerId: {
                            type: "number",
                            description: "The ID of the player to fetch details for.",
                        },
                    },
                    required: ["playerId"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `GetPlayerDetailsById callback, playerId=${args.playerId}`);
        if (!args.playerId) {
            return [JSON.stringify({ error: "playerId not provided" }), metadata];
        }

        try {
            const client = new WiseOldMan();
            const result = await client.getPlayerDetailsById(args.playerId);
            return [JSON.stringify({ results: result }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `GetPlayerDetailsById callback error, playerId=${args.playerId}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }
}