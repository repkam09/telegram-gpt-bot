import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { GPTImageProvider } from "../singletons/gpt-image";
import { HennosConsumer } from "../singletons/consumer";

export class ImageGenerationTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "generate_image",
                description: [
                    "This tool generates an image based on the provided parameters. It can be used to create images from scratch based on a text prompt.",
                    "If the user asks to you to generate, draw, sketch, or otherwise create an image, photo, picture, or any other similar request, this tool should be used to generate the image.",
                    "The more detailed the prompt the more accurate the generated image will be. If the user provides a very simple prompt, you should expand on it to get better results.",
                    "Generated image may be filtered to remove any explicit content and will be subject to other moderation rules.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The text prompt to generate the image from. The more detailed the prompt, the more accurate the generated image will be."
                        }
                    },
                    required: ["prompt"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "ImageGenerationTool callback", { prompt: args.prompt });
        if (!args.prompt) {
            return ["generate_image failed, prompt must be provided", metadata];
        }

        const interval = setInterval(() => {
            Logger.debug(req, "Refreshing telegram indicator for image generation");
            TelegramBotInstance.setTelegramIndicator(req, "upload_photo");
        }, 3000);

        // write the image to a file
        const storage = path.join(Config.LOCAL_STORAGE(req), `generated_${randomUUID()}.png`);

        try {
            const image = await GPTImageProvider.generateImage(req, args.prompt);
            await fs.writeFile(storage, image, "binary");

            clearInterval(interval);

            await TelegramBotInstance.sendImageWrapper(req, storage, { caption: `Created with OpenAI GPT Image. Prompt: ${args.prompt}` });
            return [`generate_image success. The requested image was generated using OpenAI GPT Image with the prompt '${args.prompt}'. The image has been sent to the user directly.`, metadata];
        } catch (err: unknown) {
            Logger.error(req, "GPTImageProvider error", err);
            clearInterval(interval);
            return ["generate_image failed", metadata];
        }
    }
}