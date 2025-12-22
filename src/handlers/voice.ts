import { Logger } from "../singletons/logger";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/consumer";
import { HennosResponse } from "../types";

export async function handleVoiceMessage(user: HennosUser, path: string): Promise<HennosResponse> {
    const provider = user.getProvider();

    try {
        const transcription = await provider.transcription(user, path);
        if (transcription.__type === "string") {
            const response = await handlePrivateMessage(user, transcription.payload, {
                role: "system",
                content: "The user sent their message via a voice recording. The voice recording has been transcribed into text for your convenience.",
                type: "text"
            });
            return response;
        }

        return transcription;

    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, `Error processing voice message: ${error.message}`, error);
        return {
            __type: "error",
            payload: "Sorry, I was unable to process your voice message."
        };
    }
}
