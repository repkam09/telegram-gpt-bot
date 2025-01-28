import { hennosBasePrompt } from "../../prompt";
import { HennosGroup } from "../../singletons/group";
import { Logger } from "../../singletons/logger";
import { HennosUser } from "../../singletons/user";
import { HennosResponse, HennosTextMessage } from "../../types";

export async function handleGroupMessage(user: HennosUser, group: HennosGroup, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    if (group.whitelisted || user.whitelisted) {
        return handleWhitelistedGroupMessage(user, group, text, hint);
    } else {
        return handleLimitedGroupMessage(user, group, true, text, hint);
    }
}

export async function handleOneOffGroupMessage(user: HennosUser, group: HennosGroup, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    return handleLimitedGroupMessage(user, group, false, text, hint);
}

async function handleLimitedGroupMessage(user: HennosUser, group: HennosGroup, context: boolean, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    Logger.info(group, `Limited Group Chat Completion Start, Text: ${text}`);
    const prompt: HennosTextMessage[] = await hennosBasePrompt(group);
    const provider = group.getProvider();
    const flagged = await provider.moderation(user, text);
    if (flagged) {
        if (context) {
            await group.updateUserChatContext(user, text);
            await group.updateAssistantChatContext("Sorry, I can't help with that. You message appears to violate the moderation rules.");
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
        const response = await provider.completion(group, prompt, [{
            role: "user",
            content: text,
            type: "text"
        }]);

        if (context) {
            await group.updateUserChatContext(user, text);
            await group.updateAssistantChatContext(response);
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

async function handleWhitelistedGroupMessage(user: HennosUser, group: HennosGroup, text: string, hint?: HennosTextMessage): Promise<HennosResponse> {
    Logger.debug(user, `Whitelisted Group Chat Completion Start, Text: ${text}`);
    const prompt: HennosTextMessage[] = await hennosBasePrompt(group);
    const context = await group.getChatContext();

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
        const provider = group.getProvider();
        const response = await provider.completion(group, prompt, context);
        await group.updateUserChatContext(user, text);
        await group.updateAssistantChatContext(response);

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