import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosOpenAISingleton } from "../singletons/openai";
import OpenAI from "openai";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { TelegramBotInstance } from "../services/telegram/telegram";

export class ImageGenerationTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "generate_image",
                description: [
                    "This tool generates an image based on the provided parameters. It can be used to create images from scratch based on a text prompt.",
                    "If the user asks to you to generate, draw, sketch, or otherwise create an image, photo, picture, or any other similar request, this tool should be used to generate the image.",
                    "The more detailed the prompt, the more accurate the generated image will be. If the user provides a very simple prompt, you should expand on it to get better results."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "number",
                            description: "The prompt to generate the image from. The more detailed the prompt, the more accurate the generated image will be."
                        },
                        caption: {
                            type: "string",
                            description: "The caption to add to the generated image. This will be returned to the user when the image is generated."
                        }
                    },
                    required: ["prompt"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "ImageGenerationTool callback", { prompt: args.prompt, caption: args.caption });
        if (!args.prompt) {
            return ["generate_image failed, prompt must be provided", metadata];
        }

        const instance = HennosOpenAISingleton.instance();
        const openai = instance.client as OpenAI;

        try {
            const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: args.prompt,
                n: 1,
                size: "1024x1024",
                response_format: "url"
            });

            const prompt = response.data[0].revised_prompt;

            // write the image to a file
            const storage = path.join(Config.LOCAL_STORAGE(req), `generated_${randomUUID()}.png`);

            const bin = await BaseTool.fetchBinaryData(response.data[0].url!);
            await fs.writeFile(storage, bin, "binary");

            if (req instanceof HennosUser) {
                await req.updateUserChatContext(req, `Here is the result of the generate_image tool call.\nPrompt: ${prompt} \nCaption: ${args.caption} \nSize: 1024x1024 \nSource: OpenAI DALL-E-3`);
                await req.updateUserChatImageContext({
                    local: storage,
                    mime: "image/png",
                });
            }

            // @TODO: Make this multi-platform
            await TelegramBotInstance.sendImageWrapper(req, storage, { caption: args.caption });
            return ["generate_image success. The image was sent to the user directly.", metadata];
        } catch (err: unknown) {
            Logger.error(req, "ImageGenerationTool callback error", err);
            return ["generate_image failed", metadata];
        }
    }
}