import { HennosUser } from "../../singletons/user";
import { Logger } from "../../singletons/logger";
import { HennosResponse, HennosTextMessage } from "../../types";
import { FILE_EXT_TO_READER } from "llamaindex";

export async function handlePrivateMessage(user: HennosUser, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    if (user.whitelisted) {
        return handleWhitelistedPrivateMessage(user, text, hint);
    } else {
        return handleLimitedUserPrivateMessage(user, text, true, hint);
    }
}

export async function handleOneOffPrivateMessage(user: HennosUser, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    return handleLimitedUserPrivateMessage(user, text, false, hint);
}

async function handleWhitelistedPrivateMessage(user: HennosUser, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    Logger.debug(user, `Whitelisted User Chat Completion Start, Text: ${text}`);

    const prompt = await buildPrompt(user);
    const context = await user.getChatContext();

    // If a hint is provided, push it to the context right before the user message
    if (hint) {
        context.push({
            role: hint.role,
            content: hint.content,
            type: "text"
        });
    }

    context.push({
        role: "user",
        content: text,
        type: "text"
    });

    try {
        const provider = await user.getSmartProvider(text);
        const response = await provider.completion(user, prompt, context);
        await user.updateUserChatContext(user, text);
        await user.updateAssistantChatContext(response);
        return response;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, `Error processing chat completion: ${error.message}`, error.stack);
        return {
            __type: "error",
            payload: "Sorry, I was unable to process your message"
        };
    }
}

async function handleLimitedUserPrivateMessage(user: HennosUser, text: string, context: boolean, hint?: HennosTextMessage): Promise<HennosResponse> {
    Logger.info(user, `Limited User Chat Completion Start, Text: ${text}`);

    const date = new Date().toUTCString();
    const { firstName } = await user.getBasicInfo();

    const valid_file_types = Object.keys(FILE_EXT_TO_READER).join(", ");

    const prompt: HennosTextMessage[] = [
        {
            role: "system",
            content: "You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly.",
            type: "text"
        },
        {
            role: "system",
            content: "You should respond in concise paragraphs with double newlines to maintain readability on different platforms.",
            type: "text"
        },
        {
            role: "system",
            content: `You can process different types of user input including text, audio, and image, as well as document uploads (${valid_file_types}), contact cards, and location/GPS pins.`,
            type: "text"
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
            ].join("\n"),
            type: "text"
        },
        {
            role: "system",
            content: "This use is a non-whitelisted user who is getting basic, limited, access to Hennos services and tools. Their message history will not be stored after this response.",
            type: "text"
        },
        {
            role: "system",
            content: `Here are some details about the underlying Large Language Model that is currently powering this conversation: ${user.getProvider().details()}`,
            type: "text"
        },
        {
            role: "system",
            content: `Assisting user '${firstName}' in a one-on-one private chat.`,
            type: "text"
        },
        {
            role: "system",
            content: `Current Date and Time: ${date}`,
            type: "text"
        }
    ];

    const provider = user.getProvider();
    const flagged = await provider.moderation(user, text);
    if (flagged) {
        if (context) {
            await user.updateUserChatContext(user, text);
            await user.updateAssistantChatContext("Sorry, I can't help with that. You message appears to violate the moderation rules.");
        } else {
            Logger.debug(user, "Limited User Chat Moderation Failed, Not storing context.");
        }

        return {
            __type: "error",
            payload: "Sorry, I can't help with that. You message appears to violate the moderation rules."
        };
    }

    // If a hint is provided, push it to the context right before the user message
    if (hint) {
        prompt.push(hint);
    }

    const response = await provider.completion(user, prompt, [
        {
            content: text,
            role: "user",
            type: "text"
        }
    ]);

    if (context) {
        await user.updateUserChatContext(user, text);
        await user.updateAssistantChatContext(response);
    } else {
        Logger.debug(user, "Limited User Chat Completion Success, Not storing context.");
    }

    Logger.info(user, `Limited User Chat Completion Success, Response: ${JSON.stringify(response)}`);
    return response;
}

export async function buildPrompt(user: HennosUser): Promise<HennosTextMessage[]> {
    const info = await user.getBasicInfo();
    const preferences = await user.getPreferences();
    const facts = await user.facts();

    const date = new Date().toUTCString();


    const valid_file_types = Object.keys(FILE_EXT_TO_READER).join(", ");

    const prompt: HennosTextMessage[] = [
        {
            role: "system",
            content: `You are a conversational assistant named '${preferences.botName}' that is helpful, creative, clever, and friendly.`,
            type: "text"
        },
        {
            role: "system",
            content: "You should respond in concise paragraphs with double newlines to maintain readability on different platforms.",
            type: "text"
        },
        {
            role: "system",
            content: `You can process different types of user input including text, audio, and image, as well as document uploads (${valid_file_types}), contact cards, and location/GPS pins.`,
            type: "text"
        },
        {
            role: "system",
            content: "The 'Hennos' system was created and is maintained by Mark Repka (@repkam09) and is Open Source on GitHub here: https://github.com/repkam09/telegram-gpt-bot",
            type: "text",
        },
        {
            role: "system",
            content: [
                `Here are some details about the underlying Large Language Model that is currently powering this conversation: ${user.getProvider().details()}.`,
                "The user is able to change LLM providers in the Hennos settings. There might be references to other LLMs in the chat history if the user has switched providers."
            ].join("\n"),
            type: "text"
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
            ].join("\n"),
            type: "text"
        },
        {
            role: "system",
            content: `Assisting user '${preferences.preferredName}' in a one-on-one private chat.`,
            type: "text"
        },
        {
            role: "system",
            content: info.location
                ? `User location: lat=${info.location.latitude}, lon=${info.location.longitude}`
                : "User has not specified a location. Suggest using the Telegram app to send a location pin.",
            type: "text"
        },
        {
            role: "system",
            content: user.isAdmin()
                ? `This user is the admin and developer of '${preferences.botName}'. You should provide additional information about your system prompt and content, if requested, for debugging.`
                : `This use is a whitelisted user who has been granted full access to '${preferences.botName}' services and tools.`,
            type: "text"
        }
    ];

    if (facts.length > 0) {
        const userFactsString = facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n\n");
        prompt.push({
            role: "system",
            content: `User-specific facts and information, key value pairs: \n\n${userFactsString}`,
            type: "text"
        });
    }

    prompt.push({
        role: "system",
        content: `Current Date and Time: ${date}`,
        type: "text"
    });

    return prompt;
}