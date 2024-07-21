import { Message } from "ollama";
import OpenAI from "openai";
import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";
import { duck_duck_go_search_tool, duck_duck_go_search_tool_callback, DuckDuckGoSearchArgs } from "./duck_duck_go_search";
import { open_weathermap_lookup_tool, open_weathermap_lookup_tool_callback, OpenWeatherMapToolArgs } from "./open_weather_map_lookup";
import { fetch_generic_url_tool, fetch_generic_url_tool_callback } from "./fetch_generic_url";
import { HennosConsumer } from "../singletons/base";
import { top_news_stories_tool, top_news_stories_tool_callback, TopNewsStoriesToolArgs } from "./the_news_api";

export type ToolEntries<T = { [argName: string]: string }> = {
    name: string,
    args: T
}

export async function determine_tool_calls_needed(user: HennosUser, messages: Message[]): Promise<ToolEntries[]> {
    if (!user.isAdmin()) {
        return [];
    }

    Logger.debug("Determining tool calls needed for message: ", messages[messages.length - 1].content);

    const openai = new OpenAI({
        apiKey: Config.OPENAI_API_KEY,
    });

    const info = await user.getBasicInfo();

    try {
        const date = new Date().toUTCString();

        const prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                "role": "system",
                "content": "You are a text preprocessing system that is designed to determine if any available tool calls would be helpful in answering a user request."
            },
            {
                role: "system",
                content: "Your output should match a very specific JSON structure, please follow the instructions carefully. You should output a JSON object array with the following format:" +
                    "`{ name: string, args: { [argName: string]: string } }[]` where the `name` is the name of the tool to call and the `args` is an object that matches the args shape defined in the tool definition."
            },
            {
                role: "system",
                content: `The current date and time is ${date}. You should prioritize using a tool for any request that seems to require real-time information.`
            },
            {
                role: "system",
                content: "You can select any number of tools, including zero, and can also reusing the same tool with different inputs multiple times.",
            },
            {
                role: "system",
                content: [
                    "Here are the descriptions of the possible tools that can be used to fetch additional information:",
                    JSON.stringify(top_news_stories_tool),
                    JSON.stringify(duck_duck_go_search_tool),
                    JSON.stringify(open_weathermap_lookup_tool),
                    JSON.stringify(fetch_generic_url_tool)
                ].join("\n"),
            },
            {
                role: "system",
                content: `Here is some basic information about the user that is making the request: \n${JSON.stringify(info)}`,
            },

            {
                role: "system",
                content: "Below is some context from the users conversation:",
            },
            {
                role: "user",
                content: messages.map((message) => `*${message.role}*: \n${message.content}`).join("\n\n"),
            }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            stream: false,
            response_format: { type: "json_object" },
            messages: prompt
        });

        if (!response.choices && !response.choices[0]) {
            Logger.warn(user, "Invalid OpenAI Response Shape, Missing Expected Choices");
            return [];
        }

        if (!response.choices[0].message.content) {
            Logger.warn(user, "Invalid OpenAI Response Shape, Missing Expected Message Content");
            return [];
        }

        const content = response.choices[0].message.content;
        Logger.debug(`determine_tool_calls_needed used ${response.usage?.prompt_tokens} tokens and generated ${response.usage?.completion_tokens} tokens to generate the following tool calls: `, content);

        const parsed = JSON.parse(content.trim()) as ToolEntries[];

        if (!Array.isArray(parsed)) {
            Logger.debug(`determine_tool_calls_needed resulted in a non-array response: ${parsed}`);
            return [parsed];
        }

        Logger.debug(`determine_tool_calls_needed resulted in an array response: ${parsed}`);
        return parsed;
    } catch (err) {
        Logger.warn(user, "Invalid OpenAI Response Shape, unable to parse as JSON.");
        return [];
    }
}


export async function process_tool_calls(req: HennosConsumer, tool_calls: ToolEntries[]): Promise<Message[]> {
    try {
        const results = await Promise.all(tool_calls.map(async (tool_call) => {
            if (tool_call.name === "duck_duck_go_search") {
                return duck_duck_go_search_tool_callback(req, tool_call as ToolEntries<DuckDuckGoSearchArgs>);
            }
            if (tool_call.name === "open_weather_map_lookup") {
                return open_weathermap_lookup_tool_callback(req, tool_call as ToolEntries<OpenWeatherMapToolArgs>);
            }
            if (tool_call.name === "fetch_generic_url") {
                return fetch_generic_url_tool_callback(req as HennosUser, tool_call);
            }
            if (tool_call.name === "top_news_stories") {
                return top_news_stories_tool_callback(req as HennosUser, tool_call as ToolEntries<TopNewsStoriesToolArgs>);
            }

            return undefined;
        }));

        return results.filter((tool_message): tool_message is OpenAI.Chat.Completions.ChatCompletionToolMessageParam => tool_message !== undefined);
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(req, `Error processing tool calls: ${error.message}`);
    }

    return [];
}