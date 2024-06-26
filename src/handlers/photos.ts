import { HennosAnthropicSingleton } from "../singletons/anthropic";
import { HennosOllamaSingleton } from "../singletons/ollama";
import { HennosOpenAISingleton } from "../singletons/openai";
import { HennosUser } from "../singletons/user";

type ImagePaths = {
    local: string,
    remote: string,
    mime: string
}

export async function handleImageMessage(user: HennosUser, image: ImagePaths, query?: string): Promise<string> {
    const preferences = await user.getPreferences();

    let completion;
    if (preferences.provider === "openai") {
        completion = await HennosOpenAISingleton.instance().vision(user, {
            role: "user",
            content: query ? query : "Describe this image in as much detail as possible."
        }, image.remote, image.mime);
    } else if(preferences.provider === "anthropic") {
        completion = await HennosAnthropicSingleton.instance().vision(user, {
            role: "user",
            content: query ? query : "Describe this image in as much detail as possible."
        }, image.local, image.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp");
    } else {
        completion = await HennosOllamaSingleton.instance().vision(user, {
            role: "user",
            content: query ? query : "Describe this image in as much detail as possible."
        }, image.local, image.mime);
    }

    await user.updateChatContext("user", "<metadata>The user sent an image message that was handled by a vision processing system.</metadata>");
    if (query) {        
        await user.updateChatContext("user", query);
        await user.updateChatContext("assistant", completion);
    }

    if (!query) {
        await user.updateChatContext("user", `<metadata>Here is a description of the image: ${completion}</metadata>`);
    }

    return completion;
}