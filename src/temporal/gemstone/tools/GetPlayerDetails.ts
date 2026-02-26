import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "../../../tools/BaseTool";
import { Logger } from "../../../singletons/logger";
import { WiseOldMan } from "../wom";

export class GetPlayerDetails extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "osrs_player_details",
                description: [
                    "Fetches a player's details by exact username. Returns a PlayerDetails object.",
                    WiseOldMan.PlayerDetailsDescription,
                    WiseOldMan.PlayerDetailsSnapshot,
                    WiseOldMan.PlayerDetailsSnapshotData
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        username: {
                            type: "string",
                            description: "The username of the player to fetch details for.",
                        },
                    },
                    required: ["username"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `GetPlayerDetails callback, username=${args.username}`);
        if (!args.username) {
            return [JSON.stringify({ error: "username not provided" }), metadata];
        }

        try {
            const client = new WiseOldMan();
            const result = await client.getPlayerDetails(args.username);
            return [JSON.stringify({ results: result }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `GetPlayerDetails callback error, username=${args.username}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }
}