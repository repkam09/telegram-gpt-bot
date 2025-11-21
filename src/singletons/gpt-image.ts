import OpenAI from "openai";
import { HennosConsumer } from "./consumer";
import { Logger } from "./logger";
import { HennosOpenAISingleton } from "./openai";
import { Config } from "./config";

export class GPTImageProvider {
    public static status: boolean = true;

    static async generateImage(req: HennosConsumer, prompt: string): Promise<Buffer> {
        Logger.info(req, "GPTImageProvider generateImage", { prompt });
        const instance = HennosOpenAISingleton.instance();
        const openai = instance.client as OpenAI;

        const result = await openai.images.generate({
            model: Config.OPENAI_IMAGE_MODEL,
            prompt,
            n: 1,
            user: req.chatId.toString(),
            moderation: "low"
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