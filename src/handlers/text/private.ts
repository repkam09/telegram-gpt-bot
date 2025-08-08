import { HennosUser } from "../../singletons/consumer";
import { Logger } from "../../singletons/logger";
import { HennosResponse, HennosTextMessage } from "../../types";
import { hennosBasePrompt } from "../../prompt";

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

    const prompt: HennosTextMessage[] = await hennosBasePrompt(user);
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
        const provider = user.getProvider();
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
    const prompt: HennosTextMessage[] = await hennosBasePrompt(user);
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
