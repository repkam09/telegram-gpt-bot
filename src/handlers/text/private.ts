import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../../singletons/memory";
import { isOnBlacklist, isOnWhitelist, sendMessageWrapper } from "../../utils";
import { processChatCompletion, processUserTextInput, updateChatContext, processChatCompletionFree, processFreeUserTextInput, moderateFreeUserTextInput } from "./common";
import OpenAI from "openai";
import { Logger } from "../../singletons/logger";

export async function handlePrivateMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.text) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("text_private", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        const prompt = await buildFreeTierPrompt(chatId, first_name);
        const message = await processFreeUserTextInput(chatId, msg.text);

        const flagged = await moderateFreeUserTextInput(chatId, msg.text);
        if (flagged) {
            return await sendMessageWrapper(chatId, "Sorry, I can't help with that. You message appears to violate OpenAI's Content Policy.");
        }

        const response = await processChatCompletionFree(chatId, [
            ...prompt,
            {
                content: message,
                role: "user",
            }
        ]);
        await sendMessageWrapper(chatId, response);
        return;
    }

    const name = await ChatMemory.getPerUserValue<string>(chatId, "custom-name");
    const prompt = await buildPrompt(chatId, name ? name : first_name);
    const message = await processUserTextInput(chatId, msg.text);
    const context = await updateChatContext(chatId, "user", message);
    const response = await processChatCompletion(chatId, [
        ...prompt,
        ...context
    ]);

    await updateChatContext(chatId, "assistant", response);
    await sendMessageWrapper(chatId, response);
    return;
}

export async function buildPrompt(chatId: number, name: string,): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const botName = await ChatMemory.getPerUserValue<string>(chatId, "custom-bot-name");
    const location = await ChatMemory.getPerUserValue<string>(chatId, "last-known-location");
    const date = new Date().toUTCString();

    const locationDetails = location ? `The user provided the location information previously: ${location}` : "";

    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: `You are a conversational chat assistant named '${botName || "Hennos"}' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable.`
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}. ${locationDetails}`
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${name}' in a one-on-one private chat session.`
        }
    ];

    return prompt;
}

function buildFreeTierPrompt(chatId: number, name: string,): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short sentences, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${name}' in a one-on-one private chat session.`
        },
        {
            role: "system",
            content: "This user is not whitelisted on the service and is getting basic free tier access. Their message history will not be stored after this response."
        }
    ];

    return prompt;
}