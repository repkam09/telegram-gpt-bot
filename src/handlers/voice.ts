import { createReadStream } from "node:fs";
import { Logger } from "../singletons/logger";
import { OpenAIWrapper } from "../singletons/openai";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/user";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export async function handleVoiceMessage(user: HennosUser, path: string): Promise<[string, ArrayBuffer | undefined]> {
    try {
        const instance = await OpenAIWrapper.instance();
        const transcription = await instance.audio.transcriptions.create({
            model: "whisper-1",
            file: createReadStream(path)
        });

        const response = await handlePrivateMessage(user, transcription.text);

        const { voice } = await user.getPreferences();
        const result = await instance.audio.speech.create({
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
