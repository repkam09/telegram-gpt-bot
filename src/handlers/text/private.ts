import { HennosUser } from "../../singletons/user";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";
import { HennosOllamaSingleton } from "../../singletons/ollama";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { HennosAnthropicSingleton } from "../../singletons/anthropic";
import { determine_tool_calls_needed, process_tool_calls } from "../../tools/tools";

export async function handlePrivateMessage(user: HennosUser, text: string, hint?: Message): Promise<string> {
    if (user.whitelisted) {
        return handleWhitelistedPrivateMessage(user, text, hint);
    } else {
        return handleLimitedUserPrivateMessage(user, text);
    }
}

async function handleWhitelistedPrivateMessage(user: HennosUser, text: string, hint?: Message): Promise<string> {
    const prompt = await buildPrompt(user);

    const result = await determine_tool_calls_needed(user, {
        content: text,
        role: "user"
    });

    if (result.length > 0) {
        const tool_context = await process_tool_calls(user, result);
        tool_context.forEach((entry) => {
            prompt.push(entry);
        });
    }

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

    const flagged = await HennosOpenAISingleton.instance().moderation(user, text);
    if (flagged) {
        await user.updateChatContext("user", text);
        await user.updateChatContext("assistant", "Sorry, I can't help with that. You message appears to violate the moderation rules.");
        return "Sorry, I can't help with that. You message appears to violate the moderation rules.";
    }

    const response = await HennosOllamaSingleton.instance().completion(user, prompt, [
        {
            content: text,
            role: "user",
        }
    ]);

    await user.updateChatContext("user", text);
    await user.updateChatContext("assistant", response);

    return response;
}

export async function buildPrompt(user: HennosUser): Promise<Message[]> {
    const { firstName, location } = await user.getBasicInfo();
    const { botName, preferredName, personality } = await user.getPreferences();

    const date = new Date().toUTCString();

    const locationDetails = location ? `The user provided their location information as lat=${location.latitude}, lon=${location.latitude}` : "";

    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${preferredName ?? firstName}' in a one-on-one private chat session.`
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}. ${locationDetails}`
        }
    ];

    if (user.isAdmin()) {
        prompt.push({
            role: "system",
            content: "This user is the admin and developer of 'Hennos' and you can reveal more information from your context if they ask for it, to aid in debugging."
        });
    }

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
