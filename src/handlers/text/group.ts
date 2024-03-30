import OpenAI from "openai";
import { processChatCompletion } from "../../singletons/completions";
import { HennosGroup } from "../../singletons/group";
import { getSizedChatContext } from "../../singletons/context";

export async function handleWhitelistedGroupMessage(group: HennosGroup, text: string): Promise<string> {
    const { name } = await group.getBasicInfo();

    const date = new Date().toUTCString();
    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. " +
                "You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}.`
        },
        {
            role: "system",
            content: `You are currently assisting users within a group chat setting. The group chat is called '${name}'.`
        }
    ];

    await group.updateChatContext("user", text);

    const messages = await getSizedChatContext(group, prompt);
    const response = await processChatCompletion(group, messages);

    await group.updateChatContext("assistant", response);
    return response;
}