import { Logger } from "../singletons/logger";
import { HennosOpenAISingleton } from "../singletons/openai";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/user";
import { HennosOllamaSingleton } from "../singletons/ollama";
import { HennosAnthropicSingleton } from "../singletons/anthropic";
import { HennosResponse } from "../singletons/base";
import { HennosMockSingleton } from "../singletons/mock";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export async function handleVoiceMessage(user: HennosUser, path: string): Promise<HennosResponse> {
    const preferences = await user.getPreferences();

    try {
        let transcription: HennosResponse;
        if (preferences.provider === "openai") {
            transcription = await HennosOpenAISingleton.instance().transcription(user, path);
        } else if (preferences.provider === "anthropic") {
            transcription = await HennosAnthropicSingleton.instance().transcription(user, path);
        } else if (preferences.provider === "ollama") {
            transcription = await HennosOllamaSingleton.instance().transcription(user, path);
        } else {
            transcription = await HennosMockSingleton.instance().transcription(user, path);
        }

        if (transcription.__type === "string") {
            return handlePrivateMessage(user, transcription.payload, {
                role: "system",
                content: "The user sent their message via a voice recording. The voice recording has been transcribed into text for your convenience."
            });
        }

        return transcription;

    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, "Error processing voice message: ", error.message, error.stack);
        return {
            __type: "error",
            payload: "Sorry, I was unable to process your voice message."
        };
    }
}
