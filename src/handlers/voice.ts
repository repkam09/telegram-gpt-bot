import { Logger } from "../singletons/logger";
import { HennosOpenAISingleton } from "../singletons/openai";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/user";
import { HennosOllamaSingleton } from "../singletons/ollama";
import { HennosAnthropicSingleton } from "../singletons/anthropic";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export async function handleVoiceMessage(user: HennosUser, path: string): Promise<string> {
    const preferences = await user.getPreferences();

    try {
        let transcription: string;
        if (preferences.provider === "openai") {
            transcription = await HennosOpenAISingleton.instance().transcription(user, path); 
        } else if (preferences.provider === "anthropic") {
            transcription = await HennosAnthropicSingleton.instance().transcription(user, path); 
        } else {
            transcription = await HennosOllamaSingleton.instance().transcription(user, path); 
        }

        const response = await handlePrivateMessage(user, transcription, {
            role: "system",
            content: "The user sent their message via a voice recording. The voice recording has been transcribed into text for your convenience."
        });
        return response;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, "Error processing voice message: ", error.message, error.stack);
        return "Sorry, I was unable to process your voice message.";
    }
}
