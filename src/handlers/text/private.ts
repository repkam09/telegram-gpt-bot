import TelegramBot from "node-telegram-bot-api";
import { isOnBlacklist, isOnWhitelist, sendMessageWrapper } from "../../utils";
import { processChatCompletion, processUserTextInput, updateChatContext, processChatCompletionLimited, processChatCompletionLocal, processLimitedUserTextInput, moderateLimitedUserTextInput } from "./common";
import OpenAI from "openai";
import { Logger } from "../../singletons/logger";
import { Config } from "../../singletons/config";
import { Database } from "../../singletons/prisma";

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
    await Database.upsertUser(chatId, msg.from.first_name);

    if (!isOnWhitelist(chatId)) {
        const prompt = await buildLimitedTierPrompt(chatId);
        const message = await processLimitedUserTextInput(chatId, msg.text);

        const flagged = await moderateLimitedUserTextInput(chatId, msg.text);
        if (flagged) {
            return await sendMessageWrapper(chatId, "Sorry, I can't help with that. You message appears to violate OpenAI's Content Policy.");
        }

        if (Config.OLLAMA_LLM) {
            const response = await processChatCompletionLocal(chatId, [
                ...prompt,
                {
                    content: message,
                    role: "user",
                }
            ]);
            return await sendMessageWrapper(chatId, response);
        } else {
            const response = await processChatCompletionLimited(chatId, [
                ...prompt,
                {
                    content: message,
                    role: "user",
                }
            ]);
            return await sendMessageWrapper(chatId, response);
        }
    }

    const prompt = await buildPrompt(chatId);
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

export async function buildPrompt(chatId: number): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const user = await Database.instance().user.findUniqueOrThrow({
        where: {
            id: chatId
        },
        select: {
            name: true,
            location: {
                select: {
                    date: true,
                    lat: true,
                    lng: true
                }
            },
            botName: true
        }
    });

    const date = new Date().toUTCString();
    const locationDetails = user.location ? `The user provided the location information at ${user.location.date}. Lat: ${user.location.lat}, Lng: ${user.location.lng}` : "";

    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: `You are a conversational chat assistant named '${user.botName}' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable.`
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}. ${locationDetails}`
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${user.name}' in a one-on-one private chat session.`
        }
    ];

    return prompt;
}

async function buildLimitedTierPrompt(chatId: number): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const user = await Database.instance().user.findUniqueOrThrow({
        where: {
            id: chatId
        },
        select: {
            name: true,
        }
    });
    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short sentences, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${user.name}' in a one-on-one private chat session.`
        },
        {
            role: "system",
            content: "This user is not whitelisted on the service and is getting basic, limited, tier access. Their message history will not be stored after this response."
        }
    ];

    return prompt;
}