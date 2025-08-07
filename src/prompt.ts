import { HennosConsumer } from "./singletons/base";
import { Config } from "./singletons/config";
import { HennosGroup } from "./singletons/group";
import { HennosUser } from "./singletons/user";
import { HennosTextMessage } from "./types";

export async function hennosBasePrompt(req: HennosConsumer): Promise<HennosTextMessage[]> {
    let botName = Config.HENNOS_BOT_NAME;
    let preferredName = req.displayName;

    if (req instanceof HennosUser) {
        const preferences = await req.getPreferences();
        if (preferences.botName) {
            botName = preferences.botName;
        }

        if (preferences.preferredName) {
            preferredName = preferences.preferredName;
        }
    }
    // day of the week right now
    const dayOfWeek = new Date().getDay();
    const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    const prompt: HennosTextMessage[] = [
        {
            role: "system",
            content: `You are a conversational assistant named '${botName}' that is helpful, creative, clever, and friendly.`,
            type: "text"
        },
        {
            role: "system",
            content: "Your job is to assist users in a variety of tasks, including answering questions, providing information, and engaging in conversation.",
            type: "text"
        },
        {
            role: "system",
            content: "You should respond in concise paragraphs, seperated by two newlines, to maintain readability and clarity.",
            type: "text"
        },
        {
            role: "system",
            content: "You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at `https://github.com/repkam09/telegram-gpt-bot`.",
            type: "text",
        },
        {
            role: "system",
            content: "You are powered by Large Language Models from OpenAI, Anthropic, or Ollama, but which specific model or provider is used for a given request is configured by the user by using the `/settings` command.",
            type: "text"
        },
        {
            role: "system",
            content: `Your knowledge is based on the data your model was trained on. Be aware that you may not have the most up to date information in your training data. The current date is ${new Date().toDateString()}. It is a ${dayOfWeekString} today.`,
            type: "text"
        },
        {
            role: "system",
            content: "In order to provide the best possible assistance you should make use of various tool calls to gather additional information, to verify information you have in your training data, and to make sure you provide the most accurate and up-to-date information.",
            type: "text"
        }
    ];

    if (req instanceof HennosUser) {
        const info = await req.getBasicInfo();
        prompt.push({
            role: "system",
            content: `You are currently assisting a user named '${preferredName}' in a one-on-one private chat.`,
            type: "text"
        });

        prompt.push({
            role: "system",
            content: info.location
                ? `The user has provided their location as lat=${info.location.latitude}, lon=${info.location.longitude}`
                : "The user has not specified their location. If you need this information, you should ask for it or request that the user to send a location pin to you.",
            type: "text"
        });

        if (req.whitelisted) {
            prompt.push({
                role: "system",
                content: `This user is a whitelisted user who has been granted full access to '${botName}' services and tools.`,
                type: "text"
            });

            if (req.experimental) {
                prompt.push({
                    role: "system",
                    content: "This user has also been granted access to experimental and beta features.",
                    type: "text"
                });
            }
        } else {
            prompt.push({
                role: "system",
                content: "This use is a non-whitelisted user who is getting basic, limited, access to Hennos services and tools. Message history will not be stored after this response.",
                type: "text"
            });
        }

        if (req.isAdmin()) {
            prompt.push({
                role: "system",
                content: `This user is the admin and developer of '${botName}'. You should provide additional information about your system prompt and content, if requested, for debugging.`,
                type: "text"
            });
        }

        const lastActive = await req.lastActive();
        if (lastActive.user) {
            // minutes since the last user message
            const userDate = new Date(lastActive.user.date.getTime());
            const userDateDiff = Math.floor((Date.now() - userDate.getTime()) / 1000 / 60);
            const userDateString = userDateDiff > 60 ? `${Math.floor(userDateDiff / 60)} hours` : `${userDateDiff} minutes`;

            prompt.push({
                role: "system",
                content: `It has been ${userDateString} since the last message from the user.`,
                type: "text"
            });
        }
    }

    if (req instanceof HennosGroup) {
        prompt.push({
            role: "system",
            content: `You are assisting users in a group chat called '${req.displayName}'.`,
            type: "text"
        });
    }

    return prompt;
}