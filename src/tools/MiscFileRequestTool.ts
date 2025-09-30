import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/consumer";
import { TelegramBotInstance } from "../services/telegram/telegram";

export class EbookRequest extends BaseTool {
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
                name: "ebook_request",
                description: [
                    "This tool will create a request for an ebook noting that the user has asked for this ebook to be added.",
                    "The request will be handled manually and might take some time to be fulfilled. But usually requests are handled within a few days.",
                    "These files are not available in Jellyfin/Jellyseer directly, but the media manager will reach out to the user with the status of their request usually within a few days."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        ebookTitle: {
                            type: "string",
                            description: "The title of the ebook being requested."
                        },
                        ebookAuthor: {
                            type: "string",
                            description: "The author of the ebook being requested."
                        }
                    },
                    required: ["ebookTitle", "ebookAuthor"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "ebook_request", { args });
        if (!args.ebookTitle) {
            return ["ebook_request failed, ebookTitle must be provided", metadata];
        }

        if (!args.ebookAuthor) {
            return ["ebook_request failed, ebookAuthor must be provided", metadata];
        }

        Logger.debug(req, "ebook_request", { ebookTitle: args.ebookTitle, ebookAuthor: args.ebookAuthor });

        try {
            const message = `New ebook request:\n\nTitle: ${args.ebookTitle}\nAuthor: ${args.ebookAuthor}\nRequested by: ${req.displayName})`;
            TelegramBotInstance.sendAdminMessage(message);
            return ["ebook_request: Request submitted successfully", metadata];
        } catch (error) {
            Logger.error(req, `ebook_request error: ${error}`);
            return ["ebook_request failed", metadata];
        }
    }
}


export class AudiobookRequest extends BaseTool {
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
                name: "audiobook_request",
                description: [
                    "This tool will create a request for an audiobook noting that the user has asked for this audiobook to be added.",
                    "The request will be handled manually and might take some time to be fulfilled. But usually requests are handled within a few days.",
                    "These files are not available in Jellyfin/Jellyseer directly, but the media manager will reach out to the user with the status of their request usually within a few days."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        audiobookTitle: {
                            type: "string",
                            description: "The title of the audiobook being requested."
                        },
                        audiobookAuthor: {
                            type: "string",
                            description: "The author of the audiobook being requested."
                        }
                    },
                    required: ["audiobookTitle", "audiobookAuthor"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "audiobook_request", { args });
        if (!args.audiobookTitle) {
            return ["audiobook_request failed, audiobookTitle must be provided", metadata];
        }

        if (!args.audiobookAuthor) {
            return ["audiobook_request failed, audiobookAuthor must be provided", metadata];
        }

        Logger.debug(req, "audiobook_request", { audiobookTitle: args.audiobookTitle, audiobookAuthor: args.audiobookAuthor });

        try {
            const message = `New audiobook request:\n\nTitle: ${args.audiobookTitle}\nAuthor: ${args.audiobookAuthor}\nRequested by: ${req.displayName})`;
            TelegramBotInstance.sendAdminMessage(message);
            return ["audiobook_request: Request submitted successfully", metadata];
        } catch (error) {
            Logger.error(req, `audiobook_request error: ${error}`);
            return ["audiobook_request failed", metadata];
        }
    }
}

