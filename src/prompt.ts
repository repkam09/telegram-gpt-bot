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
            content: "You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at https://github.com/repkam09/telegram-gpt-bot",
            type: "text",
        },
        {
            role: "system",
            content: "You are powered by Large Language Models from OpenAI, Anthropic, and Google, but which specific model or provider is used for a given request can be configured by the user.",
            type: "text"
        },
        {
            role: "system",
            content: `Your knowledge is based on the data your model was trained on, which has a cutoff date of October, 2023. The current date is ${new Date().toDateString()}.`,
            type: "text"
        },
        {
            role: "system",
            content: "In order to provide the best possible assistance you should utalize tool calls to verify information, provide accurate and up-to-date information, and to provide additional context.",
            type: "text"
        },
        {
            role: "system",
            content: "You should make heavy use of the search (`searxng_web_search`) and web lookup (`query_webpage_content`) tools that are available to you. ",
            type: "text"
        },
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
                content: [
                    "Because your chat context is limited, you should also make use of the key-value memory (`store_key_value_memory`) tool to store and recall long-term information about the user.",
                    "This information is prioritized over the chat context and will always be available to you."
                ].join(" "),
                type: "text"
            });

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