import OpenAI from "openai";
import { OpenAIWrapper } from "../singletons/openai";
import { HennosUser } from "../singletons/user";
import { Logger } from "../singletons/logger";

export async function handleImageMesssage(user: HennosUser, url: string, query?: string): Promise<string> {
    Logger.info(user, "handleImageMesssage Start (gpt-4-vision-preview)");

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
            type: "text",
            text: query ? query : "Describe this image in as much detail as posible"
        },
        {
            type: "image_url",
            image_url: {
                detail: "low",
                url
            }
        }
    ];

    const instance = await OpenAIWrapper.instance(user);
    const completion = await instance.chat.completions.create({
        model: "gpt-4-vision-preview",
        max_tokens: 2000,
        messages: [
            {
                role: "user",
                content
            },
        ],
    });

    const response = completion.choices[0].message.content;
    if (!response) {
        Logger.info(user, "handleImageMesssage End");
        return "No information available about this image";
    }

    if (query) {
        await user.updateChatContext("system", "The user sent an image message.");
        await user.updateChatContext("user", query);
        await user.updateChatContext("assistant", response);
    }

    if (!query) {
        await user.updateChatContext("system", `The user sent an image message. Here is a description of the image: ${response}`);
    }

    Logger.info(user, "handleImageMesssage End");
    return response;
}