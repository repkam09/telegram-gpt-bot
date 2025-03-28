import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { ComfyUIClient, type Prompt } from "comfy-ui-client";
import { ComfyHealthCheck } from "./ImageGenerationTool";

export class VideoGenerationTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "generate_video",
                description: [
                    "This tool generates a short (30 second) video based on the provided parameters. It can be used to create videos from scratch based on a text prompt.",
                    "If the user asks to you create a video, movie, animation, or any other similar request this tool should be used to generate the video.",
                    "The more detailed the prompt, the more accurate the generated video will be. If the user provides a very simple prompt, you should expand on it to get better results.",
                    "Ask the user for confirmation before using this tool and let them know that video generation may take several minutes to complete."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "number",
                            description: "The prompt to generate the video from. The more detailed the prompt, the more accurate the generated video will be."
                        },
                        caption: {
                            type: "string",
                            description: "The caption to add to the generated video. This will be returned to the user when the video is generated."
                        },
                    },
                    required: ["prompt"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "VideoGenerationTool callback", { prompt: args.prompt, caption: args.caption });
        if (!args.prompt) {
            return ["generate_video failed, prompt must be provided", metadata];
        }

        await ComfyHealthCheck.update();

        // write the image to a file
        const storage = path.join(Config.LOCAL_STORAGE(req), `generated_${randomUUID()}.webp`);

        if (!ComfyHealthCheck.shouldUseComfy(req)) {
            return ["generate_video failed, ComfyUI is not available at this time.", metadata];
        }

        try {
            const client = new ComfyUIClient(Config.COMFY_UI_ADDRESS as string, randomUUID());

            // Connect to server
            await client.connect();

            // Create the workflow prompt
            const prompt = workflow(args.prompt, 1024, 1024);

            // Generate images
            const images = await client.getImages(prompt);

            const keys = Object.keys(images);
            if (keys.length === 0) {
                Logger.error(req, "VideoGenerationTool callback error", "No video generated");
                return ["generate_video failed", metadata];
            }

            const imageContainerArray = images[keys[0]];

            const ab = await imageContainerArray[0].blob.arrayBuffer();
            await fs.writeFile(storage, Buffer.from(ab), "binary");

            // Disconnect
            await client.disconnect();

            if (req instanceof HennosUser) {
                await req.updateUserChatContext(req, `Here is the result of the generate_video tool call.\nPrompt: ${args.prompt} \nCaption: ${args.caption} \nSize: 1024x1024 \nSource: ComfyUI`);
            }

            // @TODO: Make this multi-platform
            const tg = TelegramBotInstance.instance();
            await tg.sendVideo(req.chatId, storage, { caption: args.caption });

            return ["generate_video success. The video was sent to the user directly.", metadata];
        } catch (err: unknown) {
            Logger.error(req, "VideoGenerationTool callback error", err);
            return ["generate_video failed", metadata];
        }
    }
}


function workflow(prompt: string, width: number, height: number): Prompt {
    return {
        "3": {
            "inputs": {
                "seed": 280264838563282,
                "steps": 30,
                "cfg": 6,
                "sampler_name": "uni_pc",
                "scheduler": "simple",
                "denoise": 1,
                "model": [
                    "48",
                    0
                ],
                "positive": [
                    "6",
                    0
                ],
                "negative": [
                    "7",
                    0
                ],
                "latent_image": [
                    "40",
                    0
                ]
            },
            "class_type": "KSampler",

        },
        "6": {
            "inputs": {
                "text": prompt,
                "clip": [
                    "38",
                    0
                ]
            },
            "class_type": "CLIPTextEncode",

        },
        "7": {
            "inputs": {
                "text": "bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards",
                "clip": [
                    "38",
                    0
                ]
            },
            "class_type": "CLIPTextEncode",

        },
        "8": {
            "inputs": {
                "samples": [
                    "3",
                    0
                ],
                "vae": [
                    "39",
                    0
                ]
            },
            "class_type": "VAEDecode",

        },
        "28": {
            "inputs": {
                "filename_prefix": "ComfyUI",
                "fps": 16,
                "lossless": false,
                "quality": 90,
                "method": "default",
                "images": [
                    "8",
                    0
                ]
            },
            "class_type": "SaveAnimatedWEBP",

        },
        "37": {
            "inputs": {
                "unet_name": "wan2.1_t2v_1.3B_fp16.safetensors",
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader",

        },
        "38": {
            "inputs": {
                "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                "type": "wan",
                "device": "default"
            },
            "class_type": "CLIPLoader",
        },
        "39": {
            "inputs": {
                "vae_name": "wan_2.1_vae.safetensors"
            },
            "class_type": "VAELoader",
        },
        "40": {
            "inputs": {
                "width": width,
                "height": height,
                "length": 33,
                "batch_size": 1
            },
            "class_type": "EmptyHunyuanLatentVideo",
        },
        "48": {
            "inputs": {
                "shift": 8,
                "model": [
                    "37",
                    0
                ]
            },
            "class_type": "ModelSamplingSD3",
        }
    };
}