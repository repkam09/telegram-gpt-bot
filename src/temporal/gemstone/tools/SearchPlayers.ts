import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "../../../tools/BaseTool";
import { Logger } from "../../../singletons/logger";
import { WiseOldMan } from "../wom";

export class SearchPlayers extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "osrs_search_players",
                description: [
                    "Searches for players by partial username. Returns a list of Player objects.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        username: {
                            type: "string",
                            description: "The partial username of the players to search for.",
                        },
                    },
                    required: ["username"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `SearchPlayers callback, username=${args.username}`);
        if (!args.username) {
            return [JSON.stringify({ error: "username not provided" }), metadata];
        }

        try {
            const client = new WiseOldMan();
            const result = await client.searchPlayers(args.username);
            return [JSON.stringify({ results: result }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `SearchPlayers callback error, username=${args.username}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }
}