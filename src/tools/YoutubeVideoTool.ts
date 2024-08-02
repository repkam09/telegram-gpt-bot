import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";


export class YoutubeVideoTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "youtube_video_summary",
                description: [
                    "This tool ",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        videoId: {
                            type: "string",
                            description: "The video ID of the YouTube video to get the summary for. This can be found in the URL of the video, example 'https://www.youtube.com/watch?v=[videoId]' or 'https://youtu.be/[videoId]'.",
                        }
                    },
                    required: ["videoId"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "YoutubeVideoTool callback", { url: args.url });
        if (!args.videoId) {
            return ["youtube_video_summary, videoId not provided", metadata];
        }

        try {
            // use the videoId and ytdlp to fetch the video subtitles
            // then use the subtitles to generate a summary of the video
            const summary = "";
            return [`youtube_video_summary, summary: ${summary}`, metadata];
        } catch (err) {
            const error = err as Error;
            Logger.error(req, "YoutubeVideoTool unable to process videoId", { videoId: args.videoId, err: error.message });
            return [`youtube_video_summary, resulted in an error while processing videoId ${args.videoId}`, metadata];
        }
    }
}
