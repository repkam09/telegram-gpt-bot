import { OllamaWrapper } from "../singletons/ollama";
import ollama, { Message  } from "ollama";
import { HennosUser } from "../singletons/user";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";

export async function handleImageMesssage(user: HennosUser, tempFilePath: string, query?: string): Promise<string> {
    Logger.info(user, `handleImageMesssage Start (${Config.OLLAMA_LLM_VISION.MODEL})`);

    const completion = await OllamaWrapper.instance().chat({
        stream: false,
        model: Config.OLLAMA_LLM_VISION.MODEL,
        messages: [
            {
                role: "user",
                content: query ? query : "Describe this image in as much detail as posible",
                images: [tempFilePath]
            }
        ],
    });

    const response = completion.message;
    if (!response) {
        Logger.info(user, "handleImageMesssage End");
        return "No information available about this image";
    }

    if (query) {
        await user.updateChatContext("system", "The user sent an image message");
        await user.updateChatContext("user", query);
        await user.updateChatContext("assistant", response.content);
    }

    if (!query) {
        await user.updateChatContext("system", `The user sent an image message. Here is a description of the image: ${response}`);
    }

    Logger.info(user, "handleImageMesssage End");
    return response.content;
}