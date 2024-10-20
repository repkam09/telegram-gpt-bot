import fs from "node:fs/promises";
import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { handleDocument } from "../handlers/document";
import { TextFileReader } from "llamaindex";
import path from "path";
import { Config } from "../singletons/config";



export class YoutubeVideoTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "youtube_video_summary",
                description: [
                    "This tool will download the subtitles of a YouTube video and generate a summary of the video content based on the subtitles.",
                    "Optionally, you can provide a query to tailor the summary of the video if the user has a specific question or request about its content.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        videoId: {
                            type: "string",
                            description: "The video ID of the YouTube video to get the summary for. This can be found in the URL of the video, example 'https://www.youtube.com/watch?v=[videoId]' or 'https://youtu.be/[videoId]'.",
                        },
                        query: {
                            type: "string",
                            description: "An optional query to tailor the summary of the video if the user has a specific question or request about its content.",
                        }
                    },
                    required: ["videoId"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "YoutubeVideoTool callback", { videoId: args.videoId, query: args.query });
        if (!args.videoId) {
            return ["youtube_video_summary, videoId not provided", metadata];
        }

        try {

            const filePath = await extractSubtitles(args.videoId);

            // use the videoId and ytdlp to fetch the video subtitles
            // then use the subtitles to generate a summary of the video
            const query = args.query ? args.query : "Could you summarize the content of this video based on these subtitles?";
            const summary = await handleDocument(req, filePath, args.videoId, new TextFileReader(), query);
            return [`youtube_video_summary, result: ${summary}`, metadata];
        } catch (err) {
            const error = err as Error;
            Logger.error(req, "YoutubeVideoTool unable to process videoId", { videoId: args.videoId, query: args.query, err: error.message });
            return [`youtube_video_summary, resulted in an error while processing videoId ${args.videoId}`, metadata];
        }
    }
}

// yt-dlp   --skip-download 
//          --write-subs 
//          --sub-lang en 
//          --convert-subs srt 
//          --output "transcript.%(ext)s" youtu.be/${videoId}
export async function extractSubtitles(videoId: string): Promise<string> {
    // Check if the output already exists
    const output = path.join(Config.LOCAL_STORAGE(), videoId);

    try {
        await fs.access(`${output}.en.srt`);
        Logger.debug("extractSubtitles, already exists", { output: `${output}.en.srt` });
        return `${output}.en.srt`;
    } catch (err) {
        // If the file does not exist, continue
    }

    Logger.debug("extractSubtitles, downloading", { output: `${output}.en.srt` });
    await BaseTool.exec(`yt-dlp --skip-download --write-auto-subs --write-subs --sub-lang en --convert-subs srt --output "${output}" https://youtu.be/${videoId}`);
    return `${output}.en.srt`;
}