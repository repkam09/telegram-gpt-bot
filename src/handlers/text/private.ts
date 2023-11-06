import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../../singletons/memory";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../../utils";
import { processChatCompletion, processUserTextInput, updateChatContextWithName } from "./common";
import OpenAI from "openai";
import { Logger } from "../../singletons/logger";

export async function handlePrivateMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.text) {
        return;
    }

    Logger.trace("text_private", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted: ${msg.text}`);
        return;
    }

    const prompt = buildPrompt(first_name);
    const message = await processUserTextInput(chatId, msg.text);
    const context = await updateChatContextWithName(chatId, first_name, "user", message);
    const response = await processChatCompletion(chatId, [
        ...prompt,
        ...context
    ]);

    await updateChatContextWithName(chatId, "Hennos", "assistant", response);
    await sendMessageWrapper(chatId, response);
    return;
}

export function buildPrompt(name: string,): OpenAI.Chat.ChatCompletionMessageParam[] {
    const date = new Date().toUTCString();
    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}.`
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${name}' in a one-on-one private chat session.`
        }
    ];

    return prompt;
}