import { HennosGroup } from "../../singletons/group";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";
import { HennosAnthropicSingleton } from "../../singletons/anthropic";
import { HennosUser } from "../../singletons/user";

export async function handleWhitelistedGroupMessage(user: HennosUser, group: HennosGroup, text: string): Promise<string> {
    const groupInfo = await group.getBasicInfo();
    const userInfo = await user.getBasicInfo();

    const date = new Date().toUTCString();
    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. " +
                "You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting users within a group chat setting. The group chat is called '${groupInfo.name}'. The user you are currently assisting is '${userInfo.firstName}'.`
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}.`
        }
    ];

    const context = await group.getChatContext();

    context.push({
        role: "user",
        content: text,
    });

    try {
        const response = await HennosAnthropicSingleton.instance().completion(group, prompt, context);
        await group.updateChatContext("user", text);
        await group.updateChatContext("assistant", response);
        return response;
    } catch (err) {
        const error = err as Error;
        Logger.error(group, `Error processing chat completion: ${error.message}`, error.stack);
        return "Sorry, I was unable to process your message";
    }
}