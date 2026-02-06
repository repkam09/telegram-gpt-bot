import OpenAI from "openai";
import { Config } from "./config";
import { Logger } from "./logger";

export async function generateSpeech(workflowId: string, text: string): Promise<ArrayBuffer | null> {
    try {
        Logger.info(workflowId, "OpenAI Text-To-Speech Start");
        const openai = new OpenAI({
            apiKey: Config.OPENAI_API_KEY,
        });

        const speech = await openai.audio.speech.create({
            model: Config.OPENAI_TEXT_TO_SPEECH_MODEL,
            input: text,
            voice: "alloy", // TODO: Make voice configurable
        });

        const arrayBuffer = await speech.arrayBuffer();

        Logger.info(workflowId, "OpenAI Text-To-Speech  Success");
        return arrayBuffer;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `OpenAI Text-To-Speech  Error: ${error.message}`);
        return null;
    }
}