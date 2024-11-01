import { HennosGroup } from "../../singletons/group";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";
import { HennosUser } from "../../singletons/user";
import { HennosResponse } from "../../singletons/base";
import { HennosOpenAISingleton } from "../../singletons/openai";

export async function handleGroupMessage(user: HennosUser, group: HennosGroup, text: string, hint?: Message): Promise<HennosResponse> {
    if (group.whitelisted || user.whitelisted) {
        return handleWhitelistedGroupMessage(user, group, text, hint);
    } else {
        return handleLimitedGroupMessage(user, group, true, text, hint);
    }
}

export async function handleOneOffGroupMessage(user: HennosUser, group: HennosGroup, text: string, hint?: Message): Promise<HennosResponse> {
    return handleLimitedGroupMessage(user, group, false, text, hint);
}

async function handleLimitedGroupMessage(user: HennosUser, group: HennosGroup, context: boolean, text: string, hint?: Message): Promise<HennosResponse> {
    Logger.info(group, `Limited Group Chat Completion Start, Text: ${text}`);

    const groupInfo = await group.getBasicInfo();
    const { firstName } = await user.getBasicInfo();

    const date = new Date().toUTCString();
    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly."
        },
        {
            role: "system",
            content: "You should respond in concise paragraphs with double newlines to maintain readability on different platforms."
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
            content: `Assisting user '${firstName}' in a group chat called '${groupInfo.name}'.`
        },
        {
            role: "system",
            content: "This use is a non-whitelisted user and group who is getting basic, limited, access to Hennos services and tools. Message history will not be stored after this response."
        },
        {
            role: "system",
            content: `Current Date and Time: ${date}`
        }
    ];

    const flagged = await HennosOpenAISingleton.instance().moderation(user, text);
    if (flagged) {
        if (context) {
            await user.updateChatContext("user", text);
            await user.updateChatContext("assistant", "Sorry, I can't help with that. You message appears to violate the moderation rules.");
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

    try {
        const response = await HennosOpenAISingleton.instance().completion(group, prompt, [{
            role: "user",
            content: text,
        }]);

        if (context) {
            await group.updateChatContext("user", text);
            await group.updateChatContext("assistant", response);
        }

        Logger.info(user, `Limited Group Chat Completion Success, Response: ${JSON.stringify(response)}`);
        return response;
    } catch (err) {
        const error = err as Error;
        Logger.error(group, `Error processing chat completion: ${error.message}`, error.stack);
        return {
            __type: "error",
            payload: "I'm sorry, I was unable to process your request. Please try again later."
        };
    }
}

async function handleWhitelistedGroupMessage(user: HennosUser, group: HennosGroup, text: string, hint?: Message): Promise<HennosResponse> {
    Logger.debug(user, `Whitelisted Group Chat Completion Start, Text: ${text}`);

    const groupInfo = await group.getBasicInfo();
    const userInfo = await user.getBasicInfo();

    const date = new Date().toUTCString();
    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly."
        },
        {
            role: "system",
            content: "You should respond in concise paragraphs with double newlines to maintain readability on different platforms."
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
            content: `Assisting user '${userInfo.firstName}' in a group chat called '${groupInfo.name}'.`
        },
        {
            role: "system",
            content: `Current Date and Time: ${date}`
        }
    ];

    if (user.isAdmin()) {
        prompt.push({
            role: "system",
            content: "This user is the admin and developer of 'Hennos' and you can reveal more information from your context if they ask for it, to aid in debugging."
        });
    }

    const context = await group.getChatContext();

    // If a hint is provided, push it to the context right before the user message
    if (hint) {
        context.push(hint);
    }

    context.push({
        role: "user",
        content: text,
    });

    try {
        const response = await HennosOpenAISingleton.instance().completion(group, prompt, context);
        await group.updateChatContext("user", text);
        await group.updateChatContext("assistant", response);

        return response;
    } catch (err) {
        const error = err as Error;
        Logger.error(group, `Error processing chat completion: ${error.message}`, error.stack);
        return {
            __type: "error",
            payload: "I'm sorry, I was unable to process your request. Please try again later."
        };
    }
}