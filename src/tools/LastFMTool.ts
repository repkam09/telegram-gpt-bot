import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";

export class LastFMTool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.LAST_FM_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            "type": "function",
            "function": {
                "name": "lastfm_music_info",
                "description": [
                    "This tool interacts with the Last.FM API to fetch information about music tracks, artists, or albums.",
                    "It provides details such as the artist biography, album information, top tracks, and listener statistics."
                ].join(" "),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "queryType": {
                            "type": "string",
                            "description": "The type of query to execute. Options include 'artist', 'album', or 'track'.",
                            "enum": ["artist", "album", "track"]
                        },
                        "query": {
                            "type": "string",
                            "description": "The name of the artist, album, or track to search for."
                        }
                    },
                    "required": ["queryType", "query"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "lastfm_music_info", { args });
        return ["LastFMTool callback", metadata];
    }
}