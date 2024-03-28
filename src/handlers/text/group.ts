import TelegramBot from "node-telegram-bot-api";
import { Config } from "../../singletons/config";
import { ChatMemory } from "../../singletons/memory";
import { sendMessageWrapper } from "../../utils";
import OpenAI from "openai";
import { updateChatContext, processChatCompletion, processUserTextInput, processLimitedUserTextInput, moderateLimitedUserTextInput, processChatCompletionLimited } from "./common";

export async function handleGroupMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    if (!msg.text.startsWith(Config.TELEGRAM_GROUP_PREFIX)) {
        return;
    }

    // If the user did @ the bot, strip out that @ prefix before sending the message
    msg.text = msg.text.replace(Config.TELEGRAM_GROUP_PREFIX, "");

    const group = await ChatMemory.upsertGroupInfo(msg.chat);
    await ChatMemory.upsertUserInfo(msg.from);

    if (!group.whitelisted) {
        const prompt = buildLimitedTierPrompt(group.name);
        const message = await processLimitedUserTextInput(group.chatId, msg.text);

        const flagged = await moderateLimitedUserTextInput(group.chatId, msg.text);
        if (flagged) {
            return await sendMessageWrapper(group.chatId, "Sorry, I can't help with that. Your message appears to violate OpenAI's Content Policy.");
        }

        const response = await processChatCompletionLimited(group.chatId, [
            ...prompt,
            {
                content: message,
                role: "user",
            }
        ]);
        return await sendMessageWrapper(group.chatId, response);
    }

    const prompt = buildPrompt(group.name);
    const message = await processUserTextInput(group.chatId, msg.text);
    const context = await updateChatContext(group.chatId, "user", message);

    const response = await processChatCompletion(group.chatId, [
        ...prompt,
        ...context
    ]);

    await updateChatContext(group.chatId, "assistant", response);
    await sendMessageWrapper(group.chatId, response, { reply_to_message_id: msg.message_id });
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
        },
        {
            role: "system",
            content: "This group is not whitelisted on the service and is getting basic, limited, tier access. Their message history will not be stored after this response."
        }
    ];

    return prompt;
}
