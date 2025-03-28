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
import { ComfyUIClient, type Prompt } from "comfy-ui-client";


export class ComfyHealthCheck {
    public static status: boolean = false;

    static async update(): Promise<void> {
        if (!Config.COMFY_UI_ADDRESS) {
            Logger.debug(undefined, "ComfyUI address not set, skipping health check");
            return;
        }

        const client = new ComfyUIClient(Config.COMFY_UI_ADDRESS, randomUUID());
        try {
            ComfyHealthCheck.status = false;
            await client.connect();
            await client.getSystemStats();
            ComfyHealthCheck.status = true;
        } catch (err: unknown) {
            Logger.debug(undefined, "ComfyUI health check failed", err);
            ComfyHealthCheck.status = false;
        } finally {
            await client.disconnect();
        }
    }

    static async init(): Promise<void> {
        if (Config.HENNOS_DEVELOPMENT_MODE) {
            await ComfyHealthCheck.update();
            Logger.debug(undefined, `ComfyUI status: ${ComfyHealthCheck.status}`);
            setInterval(() => {
                Logger.debug(undefined, `ComfyUI status: ${ComfyHealthCheck.status}`);
            }, 30 * 1000);
        }
    }

    static shouldUseComfy(req: HennosConsumer): boolean {
        if (!Config.COMFY_UI_ADDRESS) {
            return false;
        }

        if (!req.isAdmin()) {
            return false;
        }

        if (!ComfyHealthCheck.status) {
            Logger.warn(req, "ComfyUI should be available, but is not. Falling back to OpenAI. ");
            return false;
        }

        return true;
    }
}


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
                        },
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

        await ComfyHealthCheck.update();

        // write the image to a file
        const storage = path.join(Config.LOCAL_STORAGE(req), `generated_${randomUUID()}.png`);

        if (ComfyHealthCheck.shouldUseComfy(req)) {
            try {
                const client = new ComfyUIClient(Config.COMFY_UI_ADDRESS as string, randomUUID());

                // Connect to server
                await client.connect();

                // Create the workflow prompt
                const prompt = workflow(args.prompt, 512, 512);

                // Generate images
                const images = await client.getImages(prompt);

                const keys = Object.keys(images);
                if (keys.length === 0) {
                    Logger.error(req, "ImageGenerationTool callback error", "No images generated");
                    return ["generate_image failed", metadata];
                }

                const imageContainerArray = images[keys[0]];

                const ab = await imageContainerArray[0].blob.arrayBuffer();
                await fs.writeFile(storage, Buffer.from(ab), "binary");

                // Disconnect
                await client.disconnect();

                if (req instanceof HennosUser) {
                    await req.updateUserChatContext(req, `Here is the result of the generate_image tool call.\nPrompt: ${args.prompt} \nCaption: ${args.caption} \nSize: 512x512 \nSource: ComfyUI`);
                    await req.updateUserChatImageContext({
                        local: storage,
                        mime: "image/png",
                    });
                }
            } catch (err: unknown) {
                Logger.error(req, "ImageGenerationTool callback error", err);
                return ["generate_image failed", metadata];
            }
        } else {
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

                if (req instanceof HennosUser) {
                    await req.updateUserChatContext(req, `Here is the result of the generate_image tool call.\nPrompt: ${prompt} \nCaption: ${args.caption} \nSize: 1024x1024 \nSource: OpenAI DALL-E-3`);
                    await req.updateUserChatImageContext({
                        local: storage,
                        mime: "image/png",
                    });
                }

            } catch (err: unknown) {
                Logger.error(req, "ImageGenerationTool callback error", err);
                return ["generate_image failed", metadata];
            }
        }


        // @TODO: Make this multi-platform
        await TelegramBotInstance.sendImageWrapper(req, storage, { caption: args.caption });
        return ["generate_image success. The image was sent to the user directly.", metadata];
    }
}


function workflow(prompt: string, width: number, height: number): Prompt {
    return {
        "6": {
            "inputs": {
                "text": prompt,
                "clip": [
                    "30",
                    1
                ]
            },
            "class_type": "CLIPTextEncode",
        },
        "8": {
            "inputs": {
                "samples": [
                    "31",
                    0
                ],
                "vae": [
                    "30",
                    2
                ]
            },
            "class_type": "VAEDecode",
        },
        "9": {
            "inputs": {
                "filename_prefix": "ComfyUI",
                "images": [
                    "8",
                    0
                ]
            },
            "class_type": "SaveImage",
        },
        "27": {
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "class_type": "EmptySD3LatentImage",
        },
        "30": {
            "inputs": {
                "ckpt_name": "flux1-schnell-fp8.safetensors"
            },
            "class_type": "CheckpointLoaderSimple",
        },
        "31": {
            "inputs": {
                "seed": 528118499253373,
                "steps": 4,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1,
                "model": [
                    "30",
                    0
                ],
                "positive": [
                    "6",
                    0
                ],
                "negative": [
                    "33",
                    0
                ],
                "latent_image": [
                    "27",
                    0
                ]
            },
            "class_type": "KSampler",
        },
        "33": {
            "inputs": {
                "text": "",
                "clip": [
                    "30",
                    1
                ]
            },
            "class_type": "CLIPTextEncode",
        }
    };
}