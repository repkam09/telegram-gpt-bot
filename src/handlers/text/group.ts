import TelegramBot from "node-telegram-bot-api";
import { Config } from "../../singletons/config";
import { ChatMemory } from "../../singletons/memory";
import { isOnWhitelist, sendMessageWrapper, sendAdminMessage, isOnBlacklist } from "../../utils";
import OpenAI from "openai";
import { updateChatContext, processChatCompletion, processUserTextInput, processLimitedUserTextInput, moderateLimitedUserTextInput, processChatCompletionLocal } from "./common";
import { Logger } from "../../singletons/logger";

export async function handleGroupMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.text) {
        return;
    }

    if (!msg.text.startsWith(Config.TELEGRAM_GROUP_PREFIX)) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("text_group", msg);

    // If the user did @ the bot, strip out that @ prefix before sending the message
    msg.text = msg.text.replace(Config.TELEGRAM_GROUP_PREFIX, "");


    const { first_name, last_name, username, id } = msg.from;
    const { title } = msg.chat;

    if (!await ChatMemory.hasName(chatId)) {
        await ChatMemory.setName(chatId, `${title} [${chatId}]`);
    }

    if (!isOnWhitelist(chatId)) {
        if (Config.OLLAMA_LLM) {
            const prompt = buildLimitedTierPrompt(title || "Group Chat");
            const message = await processLimitedUserTextInput(chatId, msg.text);
            const flagged = await moderateLimitedUserTextInput(chatId, msg.text);
            if (flagged) {
                return await sendMessageWrapper(chatId, "Sorry, I can't help with that. Your message appears to violate OpenAI's Content Policy.");
            }
            const response = await processChatCompletionLocal(chatId, [
                ...prompt,
                {
                    content: message,
                    role: "user",
                }
            ]);
            return await sendMessageWrapper(chatId, response);
        }

        await sendMessageWrapper(chatId, `Sorry, this group chat has not been whitelisted to use this bot. Please request access and provide the group identifier: ${chatId}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message from group chat '${title} [${chatId}]' but the group is not whitelisted`);
        return;
    }

    const prompt = buildPrompt(title || "Group Chat");
    const message = await processUserTextInput(chatId, msg.text);
    const context = await updateChatContext(chatId, "user", message);

    const response = await processChatCompletion(chatId, [
        ...prompt,
        ...context
    ]);

    await updateChatContext(chatId, "assistant", response);
    await sendMessageWrapper(chatId, response, { reply_to_message_id: msg.message_id });
    return;
}

function buildPrompt(title: string,): OpenAI.Chat.ChatCompletionMessageParam[] {
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
            content: `You are currently assisting users within a group chat setting. The group chat is called '${title}'.`
        }
    ];

    return prompt;
}

function buildLimitedTierPrompt(title: string,): OpenAI.Chat.ChatCompletionMessageParam[] {
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
            content: `You are currently assisting users within a group chat setting. The group chat is called '${title}'.`
        }
    ];

    return prompt;
}
