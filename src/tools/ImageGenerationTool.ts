import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentResponseHandler } from "../response";
import { Candidate, GoogleGenAI } from "@google/genai";


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

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `ImageGenerationTool callback. ${JSON.stringify({ prompt: args.prompt })}`);
        if (!args.prompt) {
            return ["generate_image failed, prompt must be provided", metadata];
        }

        const interval = setInterval(() => {
            Logger.debug(workflowId, "Refreshing status indicator for image generation");
            AgentResponseHandler.handleStatus(workflowId, { type: "upload_photo" });
        }, 3000);

        // write the image to a file
        const storage = path.join(Config.LOCAL_STORAGE(workflowId), `generated_${randomUUID()}.png`);
        try {
            const [image, mimeType] = await NanoBananaImageProvider.generateImage(workflowId, args.prompt);
            await fs.writeFile(storage, image, "binary");

            clearInterval(interval);

            AgentResponseHandler.handleArtifact(workflowId, storage, mimeType, `Created with NanoBanana Image. Model: ${Config.GOOGLE_IMAGE_MODEL}`);
            return [`generate_image success. The requested image was generated using NanoBanana Image with the prompt '${args.prompt}'. The image has been sent to the user directly.`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `NanoBananaImageProvider error. ${JSON.stringify({ prompt: args.prompt, error: error.message })}`, error);
            clearInterval(interval);
            return ["generate_image failed", metadata];
        }
    }
}

class NanoBananaImageProvider {
    static async generateImage(workflowId: string, prompt: string): Promise<[Buffer, string]> {
        Logger.info(workflowId, `NanoBananaImageProvider generateImage. Prompt: ${prompt}`);
        const ai = new GoogleGenAI({
            apiKey: Config.GOOGLE_API_KEY
        });
        const response = await ai.models.generateContent({
            model: Config.GOOGLE_IMAGE_MODEL,
            contents: prompt,
        });

        let buffer: Buffer | null = null;
        let mimeType: string | null = null;
        if (!response.candidates || response.candidates.length === 0) {
            Logger.error(workflowId, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no data returned");
        }

        const candidate = response.candidates[0] as Candidate;
        if (!candidate.content) {
            Logger.error(workflowId, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no content returned");
        }

        if (!candidate.content.parts || candidate.content.parts.length === 0) {
            Logger.error(workflowId, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no parts returned");
        }

        for (const part of candidate.content.parts!) {
            if (part.inlineData) {
                const imageData = part.inlineData.data!;
                buffer = Buffer.from(imageData, "base64");
                mimeType = part.inlineData.mimeType!;
                break;
            }
        }

        if (!buffer) {
            Logger.error(workflowId, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no inline data returned");
        }

        if (!mimeType) {
            Logger.warn(workflowId, `NanoBananaImageProvider generateImage warning, no mime type returned. Prompt: ${prompt}`);
            mimeType = "image/png";
        }


        // Save the raw image png to a buffer
        return [buffer, mimeType];
    }
}