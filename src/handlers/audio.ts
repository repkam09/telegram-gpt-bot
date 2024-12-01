import { Logger } from "../singletons/logger";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/user";
import { HennosResponse } from "../types";

export async function handleAudioMessage(user: HennosUser, path: string): Promise<HennosResponse> {
    const provider = user.getProvider();

    try {
        const transcription = await provider.transcription(user, path);
        if (transcription.__type === "string") {
            const response = await handlePrivateMessage(user, transcription.payload, {
                role: "system",
                content: "The user sent an audio file. The system has attempted to transcribe the audio into text. If the audio file does not contain speech, the transcription may be inaccurate or completely incorrect.",
                type: "text"
            });
            return response;
        }

        return transcription;

    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, "Error processing audio file: ", error.message, error.stack);
        return {
            __type: "error",
            payload: "Sorry, I was unable to process your audio."
        };
    }
}
