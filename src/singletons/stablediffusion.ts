import { HennosConsumer } from "./base";
import { Config } from "./config";
import { Logger } from "./logger";

export class StableDiffusionProvider {
    public static status: boolean = false;

    static async health(): Promise<void> {
        if (!Config.SD_API_ADDRESS) {
            Logger.debug(undefined, "SD_API_ADDRESS address not set, skipping health check");
            StableDiffusionProvider.status = false;
            return;
        }

        try {
            const response = await fetch(`${Config.SD_API_ADDRESS}/sdapi/v1/options`);
            if (response.ok) {
                StableDiffusionProvider.status = true;
            } else {
                StableDiffusionProvider.status = false;
            }
        } catch (err: unknown) {
            Logger.error(undefined, "StableDiffusionProvider error", err);
            StableDiffusionProvider.status = false;
        }
    }

    static shouldUseStableDiffusion(req: HennosConsumer): boolean {
        if (Config.SD_API_ADDRESS && req.experimental && StableDiffusionProvider.status) {
            return true;
        }

        return false;
    }

    static async generateImage(req: HennosConsumer, prompt: string): Promise<Buffer> {
        const response = await fetch(`${Config.SD_API_ADDRESS}/sdapi/v1/txt2img`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: prompt,
                negative_prompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
                width: 1024,
                height: 768,
                steps: 30,
                sampler_index: "dpmpp_2m_sde",
                scheduler: "normal",
                seed: -1,
                restore_faces: true,
                cfg_scale: 5,
                denoising_strength: 1
            })
        });

        if (!response.ok) {
            Logger.error(req, "ImageGenerationTool callback error", response);
            throw new Error("Failed to generate image, response not ok");
        }

        const json = await response.json();
        if (!json.images || json.images.length === 0) {
            Logger.error(req, "ImageGenerationTool callback error", "No images returned");
            throw new Error("Failed to generate image, no images returned");
        }

        const b64image = json.images[0] as string | undefined;
        if (!b64image) {
            throw new Error("Failed to generate image, no base64 image returned");
        }

        return Buffer.from(b64image, "base64");
    }
}