import OpenAI from "openai";
import { Config } from "./config";
import { createReadStream } from "node:fs";
import { Logger } from "./logger";

export async function generateTranscription(workflowId: string, filePath: string): Promise<string> {
    try {
        Logger.info(workflowId, "LiteLLM Transcription Start");
        const client = new OpenAI({
            apiKey: Config.LITELLM_API_KEY,
            baseURL: Config.LITELLM_BASE_URL,
        });

        const transcription = await client.audio.transcriptions.create({
            model: Config.LITELLM_TRANSCRIPTION_MODEL,
            file: createReadStream(filePath)
        });

        Logger.info(workflowId, "LiteLLM Transcription Success");
        return transcription.text;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `LiteLLM Transcription Error: ${error.message}`);
        return `<transcription_error>${error.message}</transcription_error>`;
    }
}
