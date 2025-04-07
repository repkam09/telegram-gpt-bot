import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosOpenAISingleton } from "../singletons/openai";
import OpenAI from "openai";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { StableDiffusionProvider } from "../singletons/stablediffusion";
import { InvokeAIProvider } from "../singletons/invokeai";



export class ImageGenerationTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "generate_image",
                description: [
                    "This tool generates an image based on the provided parameters. It can be used to create images from scratch based on a text prompt.",
                    "If the user asks to you to generate, draw, sketch, or otherwise create an image, photo, picture, or any other similar request, this tool should be used to generate the image.",
                    "The more detailed the prompt, the more accurate the generated image will be. If the user provides a very simple prompt, you should expand on it to get better results.",
                    "NSFW prompts are allowed, but the generated image may be filtered to remove any explicit content.",
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

        await Promise.allSettled([
            StableDiffusionProvider.health(),
            InvokeAIProvider.health()
        ]);


        // write the image to a file
        const storage = path.join(Config.LOCAL_STORAGE(req), `generated_${randomUUID()}.png`);

        if (InvokeAIProvider.shouldUseInvokeAI(req)) {
            try {
                const image = await InvokeAIProvider.generateImage(req, args.prompt);
                await fs.writeFile(storage, image, "binary");

                // @TODO: Make this multi-platform
                await TelegramBotInstance.sendImageWrapper(req, storage, { caption: "Created with InvokeAI Flux." });
                return [`generate_image success. The requested image was generated using InvokeAI Flux with the prompt '${args.prompt}'. The image has been sent to the user directly.`, metadata];
            } catch (err: unknown) {
                Logger.error(req, "InvokeAIProvider error", err);
            }
        }


        if (StableDiffusionProvider.shouldUseStableDiffusion(req)) {
            try {
                const image = await StableDiffusionProvider.generateImage(req, args.prompt);
                await fs.writeFile(storage, image, "binary");

                // @TODO: Make this multi-platform
                await TelegramBotInstance.sendImageWrapper(req, storage, { caption: "Created with Stable Diffusion." });
                return [`generate_image success. The requested image was generated using Stable Diffusion with the prompt '${args.prompt}'. The image has been sent to the user directly.`, metadata];
            } catch (err: unknown) {
                Logger.error(req, "StableDiffusionProvider error", err);
            }
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

            const bin = await BaseTool.fetchBinaryData(response.data[0].url!);
            await fs.writeFile(storage, bin, "binary");

            // @TODO: Make this multi-platform
            await TelegramBotInstance.sendImageWrapper(req, storage, { caption: "Created with OpenAI DALL-E-3." });
            return [`generate_image success. The requested image was generated using OpenAI DALL-E-3 with the prompt '${prompt}'. The image has been sent to the user directly.`, metadata];
        } catch (err: unknown) {
            Logger.error(req, "ImageGenerationTool callback error", err);
            return ["generate_image failed", metadata];
        }
    }
}