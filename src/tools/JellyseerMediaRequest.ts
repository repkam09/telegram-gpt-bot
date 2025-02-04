import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";
import { Config } from "../singletons/config";
import { Logger } from "../singletons/logger";

export class JellyseerMediaRequest extends BaseTool {
    public static isEnabled(): boolean {
        if (!Config.JELLYSEER_API_KEY) {
            return false;
        }

        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "jellyseer_media_request",
                description: [
                    "This tool will create a request within the Jellyfin/Jellyseer system noting that the user has asked for this tv show or movie to be added to Jellyfin.",
                    "The request will be handled manually by the Jellyfin/Jellyseer media manager and might take some time to be fulfilled. But usually requests are handled within a few days.",
                    "Users might also refer to this media service as 'RepCast', this is the same system."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        mediaType: {
                            type: "number",
                            description: "The type of media being requested. This can be tv or movie.",
                            enum: ["tv", "movie"]
                        },
                        mediaId: {
                            type: "string",
                            description: "The ID of the media being requested. This can be determined by using the `jellyseer_media_search` tool."
                        },
                        seasons: {
                            type: "string",
                            description: "The seasons of the media being requested. This can be 'all' or a comma separated list of seasons to request. Ex. '1,2,3'. If not provided, all seasons will be requested. This is only applicable for tv shows."
                        }
                    },
                    required: ["mediaType", "mediaId"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "jellyseer_media_request", { args });
        if (!args.mediaType) {
            return ["jellyseer_media_request failed, mediaType must be provided", metadata];
        }

        if (!["tv", "movie"].includes(args.mediaType)) {
            return ["jellyseer_media_request failed, mediaType must be one of 'tv' or 'movie'", metadata];
        }

        if (!args.mediaId) {
            return ["jellyseer_media_request failed, mediaId must be provided", metadata];
        }

        try {
            const data = await BaseTool.fetchJSONData<JellyseerMedia>(`${Config.JELLYSEER_BASE_URL}/api/v1/${args.mediaType}/${args.mediaId}`, {
                "X-Api-Key": Config.JELLYSEER_API_KEY as string
            });

            if (data.mediaInfo) {
                if (Config.JELLYFIN_BASE_URL) {
                    return [`jellyseer_media_request failed, the media is already available for streaming. Stream URL: ${Config.JELLYFIN_BASE_URL}/web/index.html#/details?id=${data.mediaInfo.jellyfinMediaId}`, metadata];
                }
                return ["jellyseer_media_request failed, the media is already available for streaming.", metadata];
            }
        } catch (err: unknown) {
            Logger.error(req, `jellyseer_media_request error: ${err}`);
            return ["jellyseer_media_request failed, unable to fetch media info", metadata];
        }


        Logger.debug(req, "jellyseer_media_request", { mediaType: args.mediaType, mediaId: args.mediaId });
        try {
            const results = await BaseTool.postJSONData<JellyseerSearchResults>(`${Config.JELLYSEER_BASE_URL}/api/v1/request`, {
                "mediaType": args.mediaType,
                "mediaId": Number(args.mediaId),
                "seasons": "all",
            }, {
                "X-Api-Key": Config.JELLYSEER_API_KEY as string
            });

            Logger.debug(req, "jellyseer_media_request", results);

            return ["jellyseer_media_requestm, success", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, `jellyseer_media_request error: ${error.message}, ${error.stack}`);
            return ["jellyseer_media_request failed", metadata];
        }
    }
}

export class JellyseerMediaSearch extends BaseTool {
    public static isEnabled(): boolean {
        if (!Config.JELLYSEER_API_KEY) {
            return false;
        }

        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "jellyseer_media_search",
                description: [
                    "This tool will search the Jellyfin/Jellyseer database for a specific tv show or movie, by name.",
                    "This tool will return list of available results for the media including the mediaId, mediaType, overview, title, releaseDate, seasons, as well as a path to the poster image.",
                    "This tool will also return an 'available' flag, which will be true if the media is already available for streaming.",
                    "If the user asks to add, download, add to watchlist, or otherwise request a show, movie, or other media, this tool should be used to fetch more information about the media, including the mediaId.",
                    "The mediaId can then be used with the `jellyseer_media_request` tool to create a request for the media to be added to the Jellyseer/Jellyfin database.",
                    "Users might also refer to this media service as 'RepCast', this is the same system."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        mediaType: {
                            type: "number",
                            description: "The type of media being searched. This can be tv or movie.",
                            enum: ["tv", "movie"]
                        },
                        title: {
                            type: "string",
                            description: "The title of the media to search for within the Jellyseer/Jellyfin database."
                        }
                    },
                    required: ["mediaType", "title"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "jellyseer_media_search", { args });
        if (!args.mediaType) {
            return ["jellyseer_media_search failed, mediaType must be provided", metadata];
        }

        if (!["tv", "movie"].includes(args.mediaType)) {
            return ["jellyseer_media_search failed, mediaType must be one of 'tv' or 'movie'", metadata];
        }

        if (!args.title) {
            return ["jellyseer_media_search failed, title must be provided", metadata];
        }

        Logger.debug(req, "jellyseer_media_search", { mediaType: args.mediaType, title: args.title });

        const urlEncodedTitle = encodeURIComponent(args.title);
        try {
            const results = await BaseTool.fetchJSONData<JellyseerSearchResults>(`${Config.JELLYSEER_BASE_URL}/api/v1/search?query=${urlEncodedTitle}`, {
                "X-Api-Key": Config.JELLYSEER_API_KEY as string
            });

            const mediaInfoPromises = results.results.filter((result) => result.mediaType === args.mediaType).map((result) => BaseTool.fetchJSONData<JellyseerMedia>(`${Config.JELLYSEER_BASE_URL}/api/v1/${result.mediaType}/${result.id}`, {
                "X-Api-Key": Config.JELLYSEER_API_KEY as string
            }));

            const mediaInfo = await Promise.all(mediaInfoPromises);
            const data: MediaResult[] = mediaInfo.map((result: JellyseerMedia) => ({
                mediaType: args.mediaType,
                mediaId: result.id,
                overview: result.overview,
                posterPath: `https://image.tmdb.org/t/p/w600_and_h900_bestv2${result.posterPath}`,
                releaseDate: result.firstAirDate,
                title: result.title ? result.title : result.name!,
                seasons: [],
                available: result.mediaInfo ? true : false
            })).filter((result) => result.mediaType === args.mediaType);

            Logger.debug(req, "jellyseer_media_search", data);

            return [`jellyseer_media_search: ${JSON.stringify(data)}`, metadata];
        } catch (err: unknown) {
            Logger.error(req, `jellyseer_media_search error: ${err}`);
            return [`jellyseer_media_search unable to fetch results for ${args.title}`, metadata];
        }
    }
}

type JellyseerSearchResults = {
    "page": number,
    "totalPages": number,
    "totalResults": number,
    "results": JellyseerMedia[],
}

type JellyseerMedia = {
    id: number,
    firstAirDate: string,
    mediaType: "tv" | "movie",
    name?: string,
    title?: string,
    overview: string,
    posterPath: string,
    mediaInfo?: {
        jellyfinMediaId: string
    }
}

type MediaResult = {
    mediaType: "tv" | "movie",
    mediaId: number,
    overview: string,
    title: string,
    releaseDate: string,
    posterPath: string,
    available: boolean,
}