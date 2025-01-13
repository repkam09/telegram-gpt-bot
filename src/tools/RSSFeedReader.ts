import { Tool } from "ollama";
import { HennosConsumer } from "../singletons/base";
import { Logger } from "../singletons/logger";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export class RSSFeedReaderList extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "rss_feed_reader_list",
                description: [
                    "This tool will list all the RSS feeds that the user has added to the system.",
                    "This will include the URL of the feed as well as a unique identifier for the feed that can be used to remove the feed from the system.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "rss_feed_reader_list");
        Logger.debug(req, "rss_feed_reader_list", { args });
        return ["rss_feed_reader_list: []", metadata];
    }
}


export class RSSFeedReaderAdd extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "rss_feed_reader_add",
                description: [
                    "This tool will register a new RSS feed with the system.",
                    "The URL of the feed must be provided as a parameter.",
                    "The system will then periodically check the feed for new items and trigger a summary of the new items.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL of the RSS feed to add to the system.",
                        }
                    },
                    required: ["url"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "rss_feed_reader_add");
        Logger.debug(req, "rss_feed_reader_add", { args });
        return ["rss_feed_reader_add", metadata];
    }
}

export class RSSFeedReaderRemove extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "rss_feed_reader_remove",
                description: [
                    "This tool will remove an existing RSS feed from the system.",
                    "The ID of the feed must be provided as a parameter."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        feedId: {
                            type: "number",
                            description: "The ID of the RSS feed to remove from the system. This ID can be obtained from the 'rss_feed_reader_list' tool.",
                        }
                    },
                    required: ["feedId"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "rss_feed_reader_remove");
        Logger.debug(req, "rss_feed_reader_remove", { args });
        return ["rss_feed_reader_remove", metadata];
    }
}