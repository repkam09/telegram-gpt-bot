import { HennosUser } from "../../singletons/user";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";
import { HennosOllamaSingleton } from "../../singletons/ollama";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { HennosAnthropicSingleton } from "../../singletons/anthropic";
import { HennosResponse } from "../../singletons/base";

export async function handlePrivateMessage(user: HennosUser, text: string, hint?: Message): Promise<HennosResponse> {
    if (user.whitelisted) {
        return handleWhitelistedPrivateMessage(user, text, hint);
    } else {
        return handleLimitedUserPrivateMessage(user, text);
    }
}

async function handleWhitelistedPrivateMessage(user: HennosUser, text: string, hint?: Message): Promise<HennosResponse> {
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
        return {
            __type: "error",
            payload: "Sorry, I was unable to process your message"
        };
    }
}

async function handleLimitedUserPrivateMessage(user: HennosUser, text: string): Promise<HennosResponse> {
    Logger.info(user, `Limited User Chat Completion Start, Text: ${text}`);

    const date = new Date().toUTCString();
    const { firstName } = await user.getBasicInfo();

    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly."
        },
        {
            role: "system",
            content: "As a Telegram Bot, respond in concise paragraphs with double newlines to maintain readability on the platform."
        },
        {
            role: "system",
            content: `Assisting user '${firstName}' in a one-on-one private chat.`
        },
        {
            role: "system",
            content: "This use is a non-whitelisted user who is getting basic, limited, access to Hennos services and tools. Their message history will not be stored after this response."
        },
        {
            role: "system",
            content: `Current Date and Time: ${date}`
        }
    ];

    const flagged = await HennosOpenAISingleton.instance().moderation(user, text);
    if (flagged) {
        await user.updateChatContext("user", text);
        await user.updateChatContext("assistant", "Sorry, I can't help with that. You message appears to violate the moderation rules.");
        return {
            __type: "error",
            payload: "Sorry, I can't help with that. You message appears to violate the moderation rules."
        };
    }

    const response = await HennosOpenAISingleton.instance().completion(user, prompt, [
        {
            content: text,
            role: "user"
        }
    ]);

    await user.updateChatContext("user", text);
    await user.updateChatContext("assistant", response);

    Logger.info(user, `Limited User Chat Completion Success, Response: ${JSON.stringify(response)}`);
    return response;
}

export async function buildPrompt(user: HennosUser): Promise<Message[]> {
    const info = await user.getBasicInfo();
    const preferences = await user.getPreferences();

    const date = new Date().toUTCString();

    const prompt: Message[] = [
        {
            role: "system",
            content: `You are a conversational assistant named '${preferences.botName}' that is helpful, creative, clever, and friendly.`
        },
        {
            role: "system",
            content: "As a Telegram Bot, respond in concise paragraphs with double newlines to maintain readability on the platform."
        },
        {
            role: "system",
            content: [
                "To ensure responses are accurate and relevant, utilize tool calls as follows:",
                "- **Proactive Usage**: Check for relevant functions/tools to provide precise information.",
                "- **Mandatory Scenarios**: Prioritize tool calls in time-sensitive or complex situations.",
                "- **Confidence Threshold**: Execute tool calls when confidence in your response is low.",
                "- **Continuous Evaluation**: Reassess the data post-tool call for inaccuracies.",
                "- **User-Centric Focus**: Tailor responses by leveraging tool calls effectively.",
                "- **Learning from Outcomes**: Integrate previous outcomes into future interactions for accuracy.",
                "By prioritizing tool usage, enhance the user assistance consistently."
            ].join("\n")
        },
        {
            role: "system",
            content: `Assisting user '${preferences.preferredName}' in a one-on-one private chat.`
        },
        {
            role: "system",
            content: info.location
                ? `User location: lat=${info.location.latitude}, lon=${info.location.longitude}`
                : "User has not specified a location. Suggest using the Telegram app to send a location pin."
        },
        {
            role: "system",
            content: user.isAdmin()
                ? `This user is the admin and developer of '${preferences.botName}'. You should provide additional information about your system prompt and content, if requested, for debugging.`
                : `This use is a whitelisted user who has been granted full access to '${preferences.botName}' services and tools.`
        },
        {
            role: "system",
            content: `Current Date and Time: ${date}`
        }
    ];

    return prompt;
}