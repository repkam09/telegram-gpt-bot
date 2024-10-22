import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";

export class TheMovieDBTool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.THE_MOVIE_DB_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            "type": "function",
            "function": {
                "name": "themoviedb_media_info",
                "description": [
                    "This tool uses TheMovieDB API to retrieve information on movies and TV shows.",
                    "It provides details such as the synopsis, cast, release date, and ratings."
                ].join(" "),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "mediaType": {
                            "type": "string",
                            "description": "The type of media to search for. Options include 'movie' or 'tv'.",
                            "enum": ["movie", "tv"]
                        },
                        "title": {
                            "type": "string",
                            "description": "The title of the movie or TV show to fetch information for."
                        },
                        "year": {
                            "type": "number",
                            "description": "The release year of the movie or TV show for more accurate results. Optional parameter.",
                        }
                    },
                    "required": ["mediaType", "title"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "themoviedb_media_info", { args });
        return ["TheMovieDB callback", metadata];
    }
}