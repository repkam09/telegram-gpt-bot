import { Logger } from "../singletons/logger";
import type { HennosTool } from "../provider";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentResponseHandler } from "../response";
import OpenAI from "openai";


export class ImageGenerationTool extends BaseTool {
    public static definition(): HennosTool {
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

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `ImageGenerationTool callback. ${JSON.stringify({ prompt: args.prompt })}`);
        if (!args.prompt) {
            return ["generate_image failed, prompt must be provided", metadata];
        }

        const interval = setInterval(() => {
            Logger.debug(workflowId, "Refreshing status indicator for image generation");
            AgentResponseHandler.handleStatus(workflowId, { type: "upload_photo" });
        }, 3000);

        try {
            const [image, mimeType] = await LiteLLMImageProvider.generateImage(workflowId, args.prompt);

            // write the image to a file, using an extension that matches the returned format
            const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
            const storage = path.join(Config.LOCAL_STORAGE(workflowId), `generated_${randomUUID()}.${extension}`);
            await fs.writeFile(storage, image, "binary");

            clearInterval(interval);

            AgentResponseHandler.handleArtifact(workflowId, storage, mimeType, `Created with image model ${Config.LITELLM_IMAGE_MODEL}`);
            return [`generate_image success. The requested image was generated with the prompt '${args.prompt}'. The image has been sent to the user directly.`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `LiteLLMImageProvider error. ${JSON.stringify({ prompt: args.prompt, error: error.message })}`, error);
            clearInterval(interval);
            return ["generate_image failed", metadata];
        }
    }
}

/** Detects the image format from its magic bytes, since providers differ in what they return. */
export function detectImageMimeType(buffer: Buffer): string {
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        return "image/jpeg";
    }

    if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
        return "image/webp";
    }

    return "image/png";
}

class LiteLLMImageProvider {
    static async generateImage(workflowId: string, prompt: string): Promise<[Buffer, string]> {
        Logger.info(workflowId, `LiteLLMImageProvider generateImage. Prompt: ${prompt}`);
        const client = new OpenAI({
            apiKey: Config.LITELLM_API_KEY,
            baseURL: Config.LITELLM_BASE_URL,
        });

        // No response_format here: OpenAI image models reject it, and Gemini image models always return base64.
        const response = await client.images.generate({
            model: Config.LITELLM_IMAGE_MODEL,
            prompt,
            n: 1,
        });

        const image = response.data?.[0];
        if (!image) {
            throw new Error("Failed to generate image, no data returned");
        }

        let buffer: Buffer;
        if (image.b64_json) {
            buffer = Buffer.from(image.b64_json, "base64");
        } else if (image.url) {
            const download = await fetch(image.url);
            if (!download.ok) {
                throw new Error(`Failed to download generated image, HTTP ${download.status}`);
            }
            buffer = Buffer.from(await download.arrayBuffer());
        } else {
            throw new Error("Failed to generate image, response had neither b64_json nor url");
        }

        return [buffer, detectImageMimeType(buffer)];
    }
}
