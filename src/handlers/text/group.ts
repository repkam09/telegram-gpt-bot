import { HennosGroup } from "../../singletons/group";
import { Logger } from "../../singletons/logger";
import { Message } from "ollama";
import { HennosAnthropicSingleton } from "../../singletons/anthropic";
import { HennosUser } from "../../singletons/user";
import { HennosResponse } from "../../singletons/base";

export async function handleWhitelistedGroupMessage(user: HennosUser, group: HennosGroup, text: string): Promise<HennosResponse> {
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

    context.push({
        role: "user",
        content: text,
    });

    try {
        const response = await HennosAnthropicSingleton.instance().completion(group, prompt, context);
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