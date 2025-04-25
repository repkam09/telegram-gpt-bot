import OpenAI from "openai";
import { HennosConsumer } from "./base";
import { Logger } from "./logger";
import { HennosOpenAISingleton } from "./openai";

export class GPTImageProvider {
    public static status: boolean = true;

    static shouldUseGPTImage(req: HennosConsumer): boolean {
        return req.whitelisted;
    }

    static async generateImage(req: HennosConsumer, prompt: string): Promise<Buffer> {
        Logger.info(req, "GPTImageProvider generateImage", { prompt });
        const instance = HennosOpenAISingleton.instance();
        const openai = instance.client as OpenAI;

        const result = await openai.images.generate({
            model: "gpt-image-1",
            prompt,
            n: 1,
            user: req.chatId.toString()
        });

        if (!result.data || result.data.length === 0) {
            Logger.error(req, "GPTImageProvider generateImage error", { prompt });
            throw new Error("Failed to generate image, no data returned");
        }

        if (!result.data[0].b64_json) {
            Logger.error(req, "GPTImageProvider generateImage error", { prompt });
            throw new Error("Failed to generate image, no base64 data returned");
        }

        // Save the raw image png to a buffer
        return Buffer.from(result.data[0].b64_json, "base64");
    }
}