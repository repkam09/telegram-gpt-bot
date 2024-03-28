import TelegramBot from "node-telegram-bot-api";
import { ChatMemory, User } from "../../singletons/memory";
import { sendMessageWrapper } from "../../utils";
import { processChatCompletion, processUserTextInput, updateChatContext, processChatCompletionLimited, processLimitedUserTextInput, moderateLimitedUserTextInput } from "./common";
import OpenAI from "openai";

export async function handlePrivateMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (user.whitelisted) {
        return handleWhitelistedPrivateMessage(user, msg.text);
    } else {
        return handleLimitedUserPrivateMessage(user, msg.text);
    }
}

async function handleWhitelistedPrivateMessage(user: User, text: string) {
    const name = await ChatMemory.getPerUserValue<string>(user.chatId, "custom-name");
    const prompt = await buildPrompt(user.chatId, name ?? user.firstName);
    const message = await processUserTextInput(user.chatId, text);
    const context = await updateChatContext(user.chatId, "user", message);
    const response = await processChatCompletion(user.chatId, [
        ...prompt,
        ...context
    ]);

    await updateChatContext(user.chatId, "assistant", response);
    return sendMessageWrapper(user.chatId, response);
}

async function handleLimitedUserPrivateMessage(user: User, text: string) {
    const prompt = await buildLimitedTierPrompt(user.chatId, user.firstName);
    const message = await processLimitedUserTextInput(user.chatId, text);

    const flagged = await moderateLimitedUserTextInput(user.chatId, text);
    if (flagged) {
        return await sendMessageWrapper(user.chatId, "Sorry, I can't help with that. You message appears to violate OpenAI's Content Policy.");
    }

    const response = await processChatCompletionLimited(user.chatId, [
        ...prompt,
        {
            content: message,
            role: "user",
        }
    ]);
    return sendMessageWrapper(user.chatId, response);
}


export async function buildPrompt(chatId: number, name: string): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const botName = await ChatMemory.getPerUserValue<string>(chatId, "custom-bot-name");
    const location = await ChatMemory.getPerUserValue<string>(chatId, "last-known-location");

    const date = new Date().toUTCString();

    const locationDetails = location ? `The user provided the location information previously: ${location}` : "";

    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
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

    const personality = await ChatMemory.getPerUserValue<string>(chatId, "personality-mode");

    switch (personality) {
    case "seductive":
        prompt.unshift({
            role: "system",
            content: `You are a conversational chat assistant named '${botName || "Hennos"}' that is helpful, creative, clever, and friendly. You are also seductive and flirty.`
        });
        break;

    case "snarky":
        prompt.unshift({
            role: "system",
            content: `You are a conversational chat assistant named '${botName || "Hennos"}' that is snarky and sarcastic while still being helpful.`
        });
        break;

    default:
        prompt.unshift({
            role: "system",
            content: `You are a conversational chat assistant named '${botName || "Hennos"}' that is helpful, creative, clever, and friendly.`
        });
        break;
    }


    return prompt;
}

function buildLimitedTierPrompt(chatId: number, name: string,): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
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
            content: "This user is not whitelisted on the service and is getting basic, limited, tier access. Their message history will not be stored after this response."
        }
    ];

    return prompt;
}