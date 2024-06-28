import fs from "node:fs/promises";
import axios from "axios";
import OpenAI from "openai";
import { Logger } from "../singletons/logger";
import { Message } from "ollama";
import { ToolEntries } from "./tools";
import { Config } from "../singletons/config";
import path from "node:path";
import { handleDocument } from "../handlers/document";
import { HTMLReader } from "llamaindex";
import { HennosUser } from "../singletons/user";

export const fetch_generic_url_tool: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: "function",
    function: {
        name: "fetch_generic_url",
        description: "Fetch the content of a URL and process the HTML into text to help provide additional context to the users request. If the user has provided a URL, you should use this!",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL that should be fetched and processed",
                },
            },
            required: ["url"],
        }
    }
};

export const fetch_generic_url_tool_callback = async (req: HennosUser, tool_entry: ToolEntries): Promise<Message | undefined> => {
    if (!tool_entry.args.url) {
        return undefined;
    }

    Logger.info(req, "fetch_generic_url_tool_callback", { url: tool_entry.args.url });
    const html = await getHTML(tool_entry.args.url);
    const filePath = path.join(Config.LOCAL_STORAGE(req), "/", `${Date.now().toString()}.html`);
    await fs.writeFile(filePath, html, { encoding: "utf-8" });
    const result = await handleDocument(req, filePath, tool_entry.args.url, new HTMLReader());
    return {
        role: "system",
        content: `Summary of the content at URL '${tool_entry.args.url}': ${result}`,
    };
};

export async function getHTML(url: string): Promise<string> {
    const html = await axios({
        headers: {
            "User-Agent": "HennosBot/1.0"
        },
        method: "get",
        url: url,
        responseType: "text"
    });

    return html.data;
}
