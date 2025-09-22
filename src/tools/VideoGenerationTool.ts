import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { HennosConsumer } from "../singletons/consumer";
import { VeoThreeVideoProvider } from "../singletons/veo-3";

export class VideoGenerationTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "generate_video",
                description: [
                    "This tool generates a short video (8 seconds) based on the provided parameters. It can be used to create videos from scratch based on a text prompt.",
                    "If the user asks you to create a video, animation, a clip, or any other similar request, this tool should be used to generate the video.",
                    "Your prompt should include details such as the style, setting, characters, actions, and any dialog between the characters. The more detailed the prompt, the more accurate the generated video will be.",
                    "If the user provides a very simple prompt, you should expand on it to get better results.",
                    "The generated video can include sound effects, music, and dialog if specified in the prompt.",
                    "Generated video may be filtered to remove any explicit content and will be subject to other moderation rules.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The text prompt to generate the video from. This should be a detailed description of what you want the video to depict. Include details such as the style, setting, characters, actions, and any dialog between the characters."
                        }
                    },
                    required: ["prompt"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "VideoGenerationTool callback", { prompt: args.prompt });
        if (!args.prompt) {
            return ["generate_video failed, prompt must be provided", metadata];
        }

        const interval = setInterval(() => {
            Logger.debug(req, "Refreshing telegram indicator for video generation");
            TelegramBotInstance.setTelegramIndicator(req, "upload_video");
        }, 3000);

        // write the image to a file
        const storage = path.join(Config.LOCAL_STORAGE(req), `generated_${randomUUID()}.mp4`);

        try {
            await VeoThreeVideoProvider.generateVideo(req, args.prompt, storage);
            clearInterval(interval);
        } catch (err: unknown) {
            Logger.error(req, "VeoThreeVideoProvider error", err);
            clearInterval(interval);
            return ["generate_video failed", metadata];
        }

        try {
            await TelegramBotInstance.sendVideoWrapper(req, storage);
            return [`generate_video success. The requested video was generated using Veo 3 with the prompt '${args.prompt}'. The video has been sent to the user directly.`, metadata];
        } catch (err: unknown) {
            Logger.error(req, "TelegramBotInstance sendVideoWrapper error", err);
            return ["generate_video failed to send video", metadata];
        }
    }
}