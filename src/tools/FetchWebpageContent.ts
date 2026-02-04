import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { Tool } from "ollama";
import { AxiosError } from "axios";

import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";


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

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.url) {
            return ["fetch_webpage_content error, required parameter 'url' not provided", metadata];
        }

        Logger.info(workflowId, `fetch_webpage_content, url=${args.url}, query=${args.query}`);
        try {
            const html = await fetchPageContent(workflowId, args.url);

            // If the HTML is smaller than 32000 tokens (~128k characters), we can just return the whole thing
            if (!args.query && html.length < 128000) {
                return [`fetch_webpage_content, url: ${args.url}, page_content: ${html}`, metadata];
            }

            // Return a truncated version of the content
            return [`fetch_webpage_content, url: ${args.url}, page_content: ${html.slice(0, 128000)}... [truncated]`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            if (err instanceof AxiosError) {
                Logger.error(workflowId, `fetch_webpage_content error. url=${args.url} status=${err.response?.status} statusText=${err.response?.statusText}`, error);
                return [`fetch_webpage_content error, unable to fetch content from URL '${args.url}', HTTP Status: ${err.response?.status}, Status Text: ${err.response?.statusText}`, metadata];
            }

            Logger.error(workflowId, `fetch_webpage_content error url=${args.url} error=${error.message}`, error);
            return [`fetch_webpage_content error, unable to fetch content from URL '${args.url}'`, metadata];
        }
    }
}

export async function fetchPageContent(workflowId: string, url: string): Promise<string> {
    try {
        Logger.trace(workflowId, `fetchPageContent puppeteer: ${url}`);
        const browser = await puppeteer.launch({
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            headless: Config.PUPPETEER_HEADLESS
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: Config.PUPPETEER_WAIT_UNTIL, timeout: 60000 });

        // Remove script/style/noise before serialization to reduce size.
        await page.evaluate(() => {
            const selectors = ["script", "style", "noscript", "iframe", "svg", "canvas", "footer", "header", "form", "nav", "aside"]; // broad removal
            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => el.remove());
            }
        });

        const html = await page.content();

        let article: string | undefined;
        try {
            article = extractReadable(html, url);
        } catch (err: unknown) {
            const e = err as Error;
            Logger.debug(workflowId, `readability extraction failed. Error: ${e.message}`);
        }

        await page.close();
        await browser.close();

        return article || html;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `fetchPageContent error url=${url} error=${error.message}`, error);
        try {
            const fallback = await BaseTool.fetchTextData(url);
            const extracted = extractReadable(fallback, url) || fallback;
            return extracted;
        } catch {
            return BaseTool.fetchTextData(url);
        }
    }
}

// Extract main article content similar to Firefox Reader Mode. Returns plain text with title and byline.
function extractReadable(html: string, url: string): string | undefined {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) return undefined;
    const parts = [article.title, article.byline, article.textContent]
        .filter(Boolean)
        .map(s => (s as string).trim());
    const text = parts.join("\n\n");
    // Basic sanity: require some length
    if (text.split(/\s+/).length < 50) return undefined; // too short, maybe extraction failed
    return text;
}