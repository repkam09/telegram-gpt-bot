import fs from "node:fs/promises";
import path from "node:path";
import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { handleDocument } from "../handlers/document";
import { HTMLReader } from "llamaindex";
import { HennosUser } from "../singletons/user";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";

export class FetchGenericURLTool extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "fetch_generic_url",
                description: [
                    "This tool fetches the content from a provided URL and processes it. This works best with normal webpages that contain text content, but can also work with other types of content.",
                    "Text extraction is performed on the raw HTML document, the resulting text is summarized by a large language model, and then the summary is returned as the result of this tool call."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL that should be fetched and processed",
                        },
                        query: {
                            type: "string",
                            description: "An optional query to tailor the summary of the webpage content if the user has a specific question or request about its content.",
                        }
                    },
                    required: ["url"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        if (!args.url) {
            return ["fetch_generic_url error, required parameter 'url' not provided", metadata];
        }

        Logger.info(req, "fetch_generic_url", { url: args.url, query: args.query });
        try {
            const html = await BaseTool.fetchTextData(args.url);

            const filePath = path.join(Config.LOCAL_STORAGE(req), "/", `${Date.now().toString()}.html`);

            await fs.writeFile(filePath, html, { encoding: "utf-8" });

            const query = args.query ? args.query : "Could you provide a summary of this webpage content?";
            const result = await handleDocument(req as HennosUser, filePath, args.url, new HTMLReader(), query);
            return [`fetch_generic_url, url: ${args.url}, result: ${result}`, metadata];
        } catch (err) {
            Logger.error(req, "fetch_generic_url error", { url: args.url, error: err });
            return [`fetch_generic_url error, unable to fetch content from URL '${args.url}'`, metadata];
        }
    }
}
