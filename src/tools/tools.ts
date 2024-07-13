import { Message } from "ollama";
import OpenAI from "openai";
import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";
import { duck_duck_go_search_tool, duck_duck_go_search_tool_callback } from "./duck_duck_go_search";
import { open_weathermap_lookup_tool, open_weathermap_lookup_tool_callback } from "./open_weather_map_lookup";
import { fetch_generic_url_tool, fetch_generic_url_tool_callback } from "./fetch_generic_url";
import { HennosConsumer } from "../singletons/base";

export type ToolEntries = {
    name: string,
    args: { [argName: string]: string }
}

export async function determine_tool_calls_needed(user: HennosUser, message: Message): Promise<ToolEntries[]> {
    if (!user.isAdmin()) {
        return [];
    }

    const openai = new OpenAI({
        apiKey: Config.OPENAI_API_KEY,
    });

    try {
        const date = new Date().toUTCString();
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            stream: false,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "Take the following user request and determine if any of the following tools would be helpful in answer their request. " +
                        "You will not be actually calling the tool yourself, just determining if they would be helpful. " +
                        `You should prioritize using a tool for any request that calls for real-time information. The current date and time is ${date}.`
                },
                {
                    role: "system",
                    content: "You should output a JSON object array with the following format:" +
                        "`{ name: string, args: { [argName: string]: string } }[]` where the `name` is the name of the tool to call and the `args` is an object that matches the args defined in the tool definition. " +
                        "If it doesnt seem like a tool would be helpful for the request then just return an empty array.",
                },
                {
                    role: "system",
                    content: [
                        "Here are the descriptions of the possible tools:",
                        JSON.stringify(duck_duck_go_search_tool),
                        JSON.stringify(open_weathermap_lookup_tool),
                        JSON.stringify(fetch_generic_url_tool)
                    ].join("\n"),
                },
                {
                    role: "user",
                    content: message.content,
                }
            ],
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
            return [parsed];
        }
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
                return duck_duck_go_search_tool_callback(req, tool_call);
            }
            if (tool_call.name === "open_weather_map_lookup") {
                return open_weathermap_lookup_tool_callback(req, tool_call);
            }
            if (tool_call.name === "fetch_generic_url") {
                return fetch_generic_url_tool_callback(req as HennosUser, tool_call);
            }
        }));
        results.filter((tool_message): tool_message is OpenAI.Chat.Completions.ChatCompletionToolMessageParam => tool_message !== undefined);
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(req, `Error processing tool calls: ${error.message}`);
    }

    return [];
}