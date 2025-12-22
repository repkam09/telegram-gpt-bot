import { HennosUser } from "../../singletons/consumer";
import { Logger } from "../../singletons/logger";
import { HennosResponse, HennosTextMessage } from "../../types";
import { hennosBasePrompt } from "../../prompt";


export async function handleEventMessage(user: HennosUser, text: string): Promise<HennosResponse> {
    Logger.debug(user, `Event Completion Start, Text: ${text}`);

    const prompt: HennosTextMessage[] = await hennosBasePrompt(user);
    const context: HennosTextMessage[] = [];

    context.push({
        role: "system",
        content: ["The following message is an event sent via a third party integration.",
            "You should summarize the contents for the user, your summary will be sent to them as a notification about the event.",
            "Do not propose any follow up actions or ask any questions about what to do, just provide the summary information."
        ].join("\n"),
        type: "text"
    });

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
        Logger.error(user, `Error processing event completion: ${error.message}`, error);
        return {
            __type: "empty",
        };
    }
}
