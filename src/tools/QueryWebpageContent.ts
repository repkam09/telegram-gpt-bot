import fs from "node:fs/promises";
import path from "node:path";

import puppeteer from "puppeteer";
import { Tool } from "ollama";
import { HTMLReader } from "llamaindex";
import { AxiosError } from "axios";

import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { handleDocument } from "../handlers/document";
import { HennosUser } from "../singletons/user";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/base";


export class QueryWebpageContent extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "query_webpage_content",
                description: [
                    "This tool extracts and summarizes content from a specified URL, providing detailed insights tailored to an optional query parameter.",
                    "Ideally suited for text-rich webpages such as news articles, blog posts, and similar resources.",
                    "Use this tool to delve deeper into specific information from URLs obtained via the 'searxng_web_search' tool or when a user supplies a URL.",
                    "If the webpage content is unavailable, invalid, or non-textual, an error message may result.",
                    "Apply this tool when additional detail or verification is required from search results, or when users ask for or imply the need for specific content extraction from a given URL."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL to be fetched and summarized.",
                        },
                        query: {
                            type: "string",
                            description: "Optional: A query to refine the summary of the fetched content, based on user-specific questions or interests."
                        }
                    },
                    required: ["url"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.url) {
            return ["query_webpage_content error, required parameter 'url' not provided", metadata];
        }

        Logger.info(req, "query_webpage_content", { url: args.url, query: args.query });
        try {
            const html = await fetchPageContent(req, args.url);
            const filePath = path.join(Config.LOCAL_STORAGE(req), "/", `${Date.now().toString()}.html`);

            await fs.writeFile(filePath, html, { encoding: "utf-8" });

            const query = args.query ? args.query : "Could you provide a summary of this webpage content?";
            const result = await handleDocument(req as HennosUser, filePath, args.url, new HTMLReader(), query);
            return [`query_webpage_content, url: ${args.url}, result: ${result}`, metadata];
        } catch (err) {
            if (err instanceof AxiosError) {
                Logger.error(req, "query_webpage_content error", { url: args.url, status: err.response?.status, statusText: err.response?.statusText });
                return [`query_webpage_content error, unable to fetch content from URL '${args.url}', HTTP Status: ${err.response?.status}, Status Text: ${err.response?.statusText}`, metadata];
            }

            Logger.error(req, "query_webpage_content error", { url: args.url, error: err });
            return [`query_webpage_content error, unable to fetch content from URL '${args.url}'`, metadata];
        }
    }
}

export async function fetchPageContent(req: HennosConsumer, url: string): Promise<string> {
    if (!req.experimental) {
        Logger.trace(req, `fetchPageContent fetchTextData: ${url}`);
        return BaseTool.fetchTextData(url);
    }

    try {
        Logger.trace(req, `fetchPageContent puppeteer: ${url}`);
        const browser = await puppeteer.launch({
            headless: Config.PUPPETEER_HEADLESS
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, {
            waitUntil: Config.PUPPETEER_WAIT_UNTIL,
        });

        const content = await page.content();

        await page.close();
        await browser.close();

        return content;
    } catch (err) {
        Logger.error(req, "fetchPageContent error", { url: url, error: err });
        return BaseTool.fetchTextData(url);
    }
}