import { processChatCompletion, processChatCompletionLimited } from "../../singletons/completions";
import OpenAI from "openai";
import { HennosUser } from "../../singletons/user";
import { getSizedChatContext } from "../../singletons/context";
import { moderateLimitedUserTextInput } from "../../singletons/moderation";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";

export async function handlePrivateMessage(user: HennosUser, text: string, hint?: Message): Promise<string> {
    if (user.whitelisted) {
        return handleWhitelistedPrivateMessage(user, text, hint);
    } else {
        return handleLimitedUserPrivateMessage(user, text);
    }
}

async function handleWhitelistedPrivateMessage(user: HennosUser, text: string, hint?: Message): Promise<string> {
    const prompt = await buildPrompt(user);
    const context = await user.getChatContext();

    // If a hint is provided, push it to the context right before the user message
    if (hint) {
        context.push(hint);
    }

    context.push({
        role: "user",
        content: text
    });

    const messages = await getSizedChatContext(user, prompt, context);
    try {
        const response = await processChatCompletion(user, messages);
        await user.updateChatContext("user", text);
        await user.updateChatContext("assistant", response);
        return response;
    } catch (err) {
        const error = err as Error;
        Logger.error(user, `Error processing chat completion: ${error.message}`, error.stack);
        return "Sorry, I was unable to process your message";
    }
}

async function handleLimitedUserPrivateMessage(user: HennosUser, text: string): Promise<string> {
    const { firstName } = await user.getBasicInfo();

    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short sentences, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${firstName}' in a one-on-one private chat session.`
        },
        {
            role: "system",
            content: "This user is not whitelisted on the service and is getting basic, limited, tier access. Their message history will not be stored after this response."
        }
    ];

    const flagged = await moderateLimitedUserTextInput(user, text);
    if (flagged) {
        return "Sorry, I can't help with that. You message appears to violate OpenAI's Content Policy.";
    }

    const response = await processChatCompletionLimited(user, [
        ...prompt,
        {
            content: text,
            role: "user",
        }
    ]);
    return response;
}

export async function buildPrompt(user: HennosUser): Promise<Message[]> {
    const { firstName, location } = await user.getBasicInfo();
    const { botName, preferredName, personality } = await user.getPreferences();

    const date = new Date().toUTCString();

    const locationDetails = location ? `The user provided the location information as lat=${location.latitude}, lon=${location.latitude}` : "";

    const prompt: Message[] = [
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
            content: `You are currently assisting a user named '${preferredName ?? firstName}' in a one-on-one private chat session.`
        }
    ];

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
