import OpenAI from "openai";
import { Config } from "./config";
import { createReadStream } from "node:fs";
import { Logger } from "./logger";

export async function generateTranscription(workflowId: string, filePath: string): Promise<string> {
    try {
        Logger.info(workflowId, "OpenAI Transcription Start");
        const openai = new OpenAI({
            apiKey: Config.OPENAI_API_KEY,
        });

        const transcription = await openai.audio.transcriptions.create({
            model: Config.OPENAI_TRANSCRIPTION_MODEL,
            file: createReadStream(filePath)
        });

        Logger.info(workflowId, "OpenAI Transcription Success");
        return transcription.text;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `OpenAI Transcription Error: ${error.message}`);
        return `<transcription_error>${error.message}</transcription_error>`;
    }
}