import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { Logger } from "../singletons/logger";
import { signalAgenticWorkflowAdminMessage } from "../temporal/agent/interface";

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

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `ebook_request. ${JSON.stringify({ args })}`);
        if (!args.ebookTitle) {
            return [JSON.stringify({ error: "ebookTitle must be provided" }), metadata];
        }

        if (!args.ebookAuthor) {
            return [JSON.stringify({ error: "ebookAuthor must be provided" }), metadata];
        }

        Logger.debug(workflowId, `ebook_request. ${JSON.stringify({ ebookTitle: args.ebookTitle, ebookAuthor: args.ebookAuthor })}`);

        try {
            const formattedMessage = `New ebook request:\n\nTitle: ${args.ebookTitle}\nAuthor: ${args.ebookAuthor}\nRequested by: ${workflowId})`;
            await signalAgenticWorkflowAdminMessage(workflowId, `<ebook_request>\n${formattedMessage}\n</ebook_request>`);
            return [JSON.stringify({ status: "requested" }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `ebook_request error: ${error.message}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
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

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `audiobook_request. ${JSON.stringify({ args })}`);
        if (!args.audiobookTitle) {
            return [JSON.stringify({ error: "audiobookTitle must be provided" }), metadata];
        }

        if (!args.audiobookAuthor) {
            return [JSON.stringify({ error: "audiobookAuthor must be provided" }), metadata];
        }

        Logger.debug(workflowId, `audiobook_request. ${JSON.stringify({ audiobookTitle: args.audiobookTitle, audiobookAuthor: args.audiobookAuthor })}`);

        try {
            const formattedMessage = `New audiobook request:\n\nTitle: ${args.audiobookTitle}\nAuthor: ${args.audiobookAuthor}\nRequested by: ${workflowId})`;
            await signalAgenticWorkflowAdminMessage(workflowId, `<audiobook_request>\n${formattedMessage}\n</audiobook_request>`);
            return [JSON.stringify({ status: "requested" }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `audiobook_request error: ${error.message}`, error);
            return [JSON.stringify({ error: error.message }), metadata];
        }
    }
}

