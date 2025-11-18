import { Config } from "../config";
import { HennosConsumer } from "../consumer";
import { Logger } from "../logger";
import { GoogleGenAI } from "@google/genai";

export class VeoThreeVideoProvider {
    public static status: boolean = true;

    static async generateVideo(req: HennosConsumer, prompt: string, output: string): Promise<void> {
        Logger.info(req, "VeoThreeVideoProvider generateVideo", { prompt });
        const ai = new GoogleGenAI({
            apiKey: Config.GOOGLE_API_KEY
        });

        let operation = await ai.models.generateVideos({
            model: "veo-3.0-generate-001",
            prompt: prompt,
        });

        // Poll the operation status until the video is ready.
        while (!operation.done) {
            Logger.debug(req, "Waiting for video generation to complete...");
            await new Promise((resolve) => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({
                operation: operation,
            });
        }

        Logger.info(req, "Video generation completed");

        if (!operation.response || !operation.response.generatedVideos || operation.response.generatedVideos.length === 0) {
            Logger.error(req, "VeoThreeVideoProvider generateVideo error", { prompt });
            throw new Error("Failed to generate video, no data returned");
        }

        // Download the generated video.
        await ai.files.download({
            file: operation.response!.generatedVideos[0].video!,
            downloadPath: output,
        });

        // sleep 10 seconds to ensure the file is fully written
        await new Promise((resolve) => setTimeout(resolve, 10000));

        Logger.info(req, `Generated video saved to ${output}`);
    }
}