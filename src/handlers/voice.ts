import { Logger } from "../singletons/logger";
import { HennosOpenAIProvider } from "../singletons/openai";
import { handlePrivateMessage } from "./text/private";
import { HennosUser } from "../singletons/user";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export async function handleVoiceMessage(user: HennosUser, path: string): Promise<[string, ArrayBuffer | undefined]> {
    try {
        const transcription = await HennosOpenAIProvider.transcription(user, path); 

        const response = await handlePrivateMessage(user, transcription, {
            role: "system",
            content: "The user sent their message via a voice recording. The voice recording has been transcribed into text for your convenience."
        });

        const arrayBuffer = await HennosOpenAIProvider.speech(user, response);
        return [response, arrayBuffer];
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, "Error processing voice message: ", error.message, error.stack);
        return ["Sorry, I was unable to process your voice message.", undefined];
    }
}
