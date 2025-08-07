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


export class FetchWebpageContent extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "fetch_webpage_content",
                description: [
                    "This tool fetches the text content of a webpage from a given URL. If the `query` parameter is provided the tool will return a summary of the content based on the query instead of the full page content.",
                    "If the `query` is not provided the tool will return the full text content of the page up to a maximum of 32000 tokens (~128k characters).",
                    "If the content exceeds this limit, the tool will save the content to a temporary file and use document processing to provide a summary of the content before returning it.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL to load the text content from.",
                        },
                        query: {
                            type: "string",
                            description: "An optional query to summarize or extract specific information from the webpage content."
                        }
                    },
                    required: ["url"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.url) {
            return ["fetch_webpage_content error, required parameter 'url' not provided", metadata];
        }

        Logger.info(req, "fetch_webpage_content", { url: args.url, query: args.query });
        try {
            const html = await fetchPageContent(req, args.url);


            // If the HTML is smaller than 32000 tokens (~128k characters), we can just return the whole thing
            if (!args.query && html.length < 128000) {
                return [`fetch_webpage_content, url: ${args.url}, page_content: ${html}`, metadata];
            }

            const filePath = path.join(Config.LOCAL_STORAGE(req), "/", `${Date.now().toString()}.html`);

            await fs.writeFile(filePath, html, { encoding: "utf-8" });

            const query = args.query ? args.query : "Could you provide a summary of this webpage content?";
            const result = await handleDocument(req as HennosUser, filePath, args.url, new HTMLReader(), query);
            return [`fetch_webpage_content, url: ${args.url}, result: ${result}`, metadata];
        } catch (err) {
            if (err instanceof AxiosError) {
                Logger.error(req, "fetch_webpage_content error", { url: args.url, status: err.response?.status, statusText: err.response?.statusText });
                return [`fetch_webpage_content error, unable to fetch content from URL '${args.url}', HTTP Status: ${err.response?.status}, Status Text: ${err.response?.statusText}`, metadata];
            }

            Logger.error(req, "fetch_webpage_content error", { url: args.url, error: err });
            return [`fetch_webpage_content error, unable to fetch content from URL '${args.url}'`, metadata];
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
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
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