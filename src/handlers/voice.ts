import { createReadStream } from "node:fs";
import { Logger } from "../singletons/logger";
import { OpenAIWrapper } from "../singletons/openai";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/user";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export async function handleVoiceMessage(user: HennosUser, path: string): Promise<[string, ArrayBuffer | undefined]> {
    try {
        const transcription = await OpenAIWrapper.instance().audio.transcriptions.create({
            model: "whisper-1",
            file: createReadStream(path)
        });

        const response = await handlePrivateMessage(user, transcription.text, {
            role: "system",
            content: "The user sent their message via a voice recording. The voice recording has been transcribed into text for your convenience."
        });

        const { voice } = await user.getPreferences();
        const result = await OpenAIWrapper.instance().audio.speech.create({
            model: "tts-1",
            voice: voice,
            input: response,
            response_format: "opus"
        });

        const arrayBuffer = await result.arrayBuffer();
        return [response, arrayBuffer];
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, "Error processing voice message: ", error.message, error.stack);
        return ["Sorry, I was unable to process your voice message.", undefined];
    }
}
