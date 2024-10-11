import { HennosUser } from "../../singletons/user";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";
import { HennosOllamaSingleton } from "../../singletons/ollama";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { HennosAnthropicSingleton } from "../../singletons/anthropic";

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

    const preferences = await user.getPreferences();
    try {
        switch (preferences.provider) {
            case "openai": {
                const response = await HennosOpenAISingleton.instance().completion(user, prompt, context);
                await user.updateChatContext("user", text);
                await user.updateChatContext("assistant", response);
                return response;
            }

            case "anthropic": {
                const response = await HennosAnthropicSingleton.instance().completion(user, prompt, context);
                await user.updateChatContext("user", text);
                await user.updateChatContext("assistant", response);
                return response;
            }

            default: {
                const response = await HennosOllamaSingleton.instance().completion(user, prompt, context);
                await user.updateChatContext("user", text);
                await user.updateChatContext("assistant", response);
                return response;
            }
        }
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, `Error processing chat completion: ${error.message}`, error.stack);
        return "Sorry, I was unable to process your message";
    }
}

async function handleLimitedUserPrivateMessage(user: HennosUser, text: string): Promise<string> {
    Logger.info(user, `Limited User Chat Completion Start, Text: ${text}`);
    const { firstName } = await user.getBasicInfo();

    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly."
        },
        {
            role: "system",
            content: "You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${firstName}' in a one-on-one private chat session.`
        },
        {
            role: "system",
            content: "This user is not whitelisted and is getting basic, limited, tier access to Hennos. Their message history will not be stored after this response."
        }
    ];

    const flagged = await HennosOpenAISingleton.instance().moderation(user, text);
    if (flagged) {
        await user.updateChatContext("user", text);
        await user.updateChatContext("assistant", "Sorry, I can't help with that. You message appears to violate the moderation rules.");
        return "Sorry, I can't help with that. You message appears to violate the moderation rules.";
    }

    const response = await HennosOllamaSingleton.instance().completion(user, prompt, [
        {
            content: text,
            role: "user"
        }
    ]);

    await user.updateChatContext("user", text);
    await user.updateChatContext("assistant", response);

    Logger.info(user, `Limited User Chat Completion Success, Response: ${response}`);
    return response;
}

export async function buildPrompt(user: HennosUser): Promise<Message[]> {
    const info = await user.getBasicInfo();
    const preferences = await user.getPreferences();

    const date = new Date().toUTCString();
    const userName = preferences.preferredName ? preferences.preferredName : info.firstName;
    const botName = preferences.botName ? preferences.botName : "Hennos";

    const prompt: Message[] = [
        {
            role: "system",
            content: `You are a conversational chat assistant named '${botName}' that is helpful, creative, clever, and friendly.`
        },
        {
            role: "system",
            content: "You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: "You should use any available functions and tools to ensure that your responses are accurate and up to date. You should do this automatically and without the user needing to ask you to do so."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${userName}' in a one-on-one private chat session.`
        }
    ];

    if (info.location) {
        prompt.push({
            role: "system",
            content: `The user provided their location information as lat=${info.location.latitude}, lon=${info.location.longitude}`
        });
    } else {
        prompt.push({
            role: "system",
            content: "The user has not specified their location. They can do this by using the Telegram mobile app to send a Location GPS pin."
        });
    }

    if (user.isAdmin()) {
        prompt.push({
            role: "system",
            content: "This user is the admin and developer of 'Hennos' and you can reveal more information from your context if they ask for it, to aid in debugging."
        });
    }

    prompt.push({
        role: "system",
        content: `The current Date and Time is ${date}.`
    });

    return prompt;
}
