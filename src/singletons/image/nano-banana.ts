import { Config } from "../config";
import { HennosConsumer } from "../consumer";
import { Logger } from "../logger";
import { Candidate, GoogleGenAI } from "@google/genai";

export class NanoBananaImageProvider {
    public static status: boolean = true;

    static async generateImage(req: HennosConsumer, prompt: string): Promise<Buffer> {
        Logger.info(req, `NanoBananaImageProvider generateImage. Prompt: ${prompt}`);
        const ai = new GoogleGenAI({
            apiKey: Config.GOOGLE_API_KEY
        });
        const response = await ai.models.generateContent({
            model: Config.GOOGLE_IMAGE_MODEL,
            contents: prompt,
        });

        let buffer: Buffer | null = null;
        if (!response.candidates || response.candidates.length === 0) {
            Logger.error(req, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no data returned");
        }

        const candidate = response.candidates[0] as Candidate;
        if (!candidate.content) {
            Logger.error(req, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no content returned");
        }

        if (!candidate.content.parts || candidate.content.parts.length === 0) {
            Logger.error(req, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no parts returned");
        }

        for (const part of candidate.content.parts!) {
            if (part.inlineData) {
                const imageData = part.inlineData.data!;
                buffer = Buffer.from(imageData, "base64");
                break;
            }
        }

        if (!buffer) {
            Logger.error(req, `NanoBananaImageProvider generateImage error. Prompt: ${prompt}`);
            throw new Error("Failed to generate image, no inline data returned");
        }

        // Save the raw image png to a buffer
        return buffer;
    }
}