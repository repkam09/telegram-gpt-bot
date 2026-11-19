import { existsSync } from "node:fs";
import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";
import { isProbablyReaderable, Readability } from "@mozilla/readability";
import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { resolveLegacyModelProvider } from "../provider";
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
                    "This tool fetches the text content of a webpage from a given URL.",
                    "If the `query` parameter is provided the tool will return an answer to the query based on the content of the page instead of the full page content.",
                    "If the `query` is not provided the tool will return the text content of the page, truncated to a maximum of roughly 32000 characters.",
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
            return [JSON.stringify({ error: "required parameter 'url' not provided" }), metadata];
        }

        Logger.info(workflowId, `fetch_webpage_content, url=${args.url}, query=${args.query}`);

        try {
            const content = await fetchPageContent(workflowId, args.url);

            if (!args.query) {
                return [truncateContent(content, Config.HENNOS_WEBPAGE_MAX_LENGTH), metadata];
            }

            const answer = await answerFromContent(workflowId, content, args.query);
            if (answer) {
                return [JSON.stringify({ answer }), metadata];
            }

            // The model call failed or returned nothing useful, so hand the (truncated) page back and let the caller work from it.
            Logger.warn(workflowId, `fetch_webpage_content could not answer the query from the page, returning page content instead. url=${args.url}`);
            return [truncateContent(content, Config.HENNOS_WEBPAGE_MAX_LENGTH), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `fetch_webpage_content error url=${args.url} error=${error.message}`, error);
            return [JSON.stringify({ error: `unable to fetch content from URL '${args.url}'` }), metadata];
        }
    }
}

// Puppeteer needs a Chrome download that npm only performs through puppeteer's install script (see "allowScripts" in package.json).
// Without it fetchPageContent silently degrades to a plain HTTP fetch that cannot render JavaScript, so say so loudly at startup.
export async function checkBrowserInstalled(): Promise<boolean> {
    let executable: string | null = null;
    try {
        executable = await puppeteer.executablePath();
    } catch {
        // Handled below: treated the same as a missing browser.
    }

    if (executable && existsSync(executable)) {
        Logger.info("Hennos", `Chrome for web page fetching found at ${executable}`);
        return true;
    }

    Logger.warn("Hennos", `Chrome for puppeteer was not found${executable ? ` at ${executable}` : ""}. fetch_webpage_content will fall back to plain HTTP requests, which cannot render JavaScript. Run \`npx puppeteer browsers install chrome\` to install it.`);
    return false;
}

export async function fetchPageContent(workflowId: string, url: string): Promise<string> {
    try {
        Logger.trace(workflowId, `fetchPageContent puppeteer: ${url}`);
        const browser = await puppeteer.launch({
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            headless: true
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

        let article: string | null = null;
        try {
            article = extractReadable(workflowId, html, url);
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
            const extracted = extractReadable(workflowId, fallback, url) || fallback;
            return extracted;
        } catch {
            return BaseTool.fetchTextData(url);
        }
    }
}

// Extract main article content similar to Firefox Reader Mode. Returns plain text with title and byline.
function extractReadable(workflowId: string, html: string, url: string): string | null {
    const dom = new JSDOM(html, { url });
    if (!isProbablyReaderable(dom.window.document)) {
        return null;
    }

    const readable = new Readability(dom.window.document);
    const parsed = readable.parse();
    if (!parsed) {
        return null;
    }

    const parts = [parsed.title, parsed.byline, parsed.textContent]
        .filter(Boolean)
        .join("\n\n");

    // Basic sanity: require some length
    if (parts.split(/\s+/).length < 50) return null; // too short, maybe extraction failed

    Logger.debug(workflowId,
        `Extracted readable content length: ${parts.length} characters. Contents: ${parts.substring(0, 500)}...`,
    );

    return parts;
}


// Keeps the start of the page and tells the caller when something was cut off.
export function truncateContent(content: string, limit: number): string {
    if (content.length <= limit) {
        return content;
    }

    return `${content.substring(0, limit)}\n\n[Content truncated: showing the first ${limit} of ${content.length} characters]`;
}

// Upper bound on how many chunks of a very long page are read, so one call cannot fan out into an unbounded number of model requests.
const MAX_ANSWER_CHUNKS = 8;

// Answers `query` from the page content with the low tier model. Pages longer than one chunk are handled map-reduce style:
// each chunk is reduced to the parts relevant to the query, and the notes are then combined into a single answer.
// Returns null when the model call fails, so the caller can fall back to returning the page text.
export async function answerFromContent(workflowId: string, content: string, query: string): Promise<string | null> {
    try {
        const provider = await resolveLegacyModelProvider(workflowId, "low");
        const chunkSize = Config.HENNOS_WEBPAGE_MAX_LENGTH;

        const chunks: string[] = [];
        for (let offset = 0; offset < content.length && chunks.length < MAX_ANSWER_CHUNKS; offset += chunkSize) {
            chunks.push(content.substring(offset, offset + chunkSize));
        }

        if (chunks.length === 1) {
            return await invokeText(workflowId, provider, answerPrompt(query, chunks[0]));
        }

        Logger.debug(workflowId, `Page content of ${content.length} characters split into ${chunks.length} chunks to answer the query.`);
        const notes: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            const note = await invokeText(workflowId, provider, notesPrompt(query, chunks[i], i + 1, chunks.length));
            if (note && note.toUpperCase() !== "NONE") {
                notes.push(note);
            }
        }

        if (notes.length === 0) {
            return null;
        }

        return await invokeText(workflowId, provider, answerPrompt(query, notes.join("\n\n")));
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(workflowId, `fetch_webpage_content failed to answer the query from the page content: ${error.message}`, error);
        return null;
    }
}

async function invokeText(workflowId: string, provider: Awaited<ReturnType<typeof resolveLegacyModelProvider>>, prompt: string): Promise<string | null> {
    const response = await provider.invoke(workflowId, [{ role: "user", content: prompt, type: "text" }]);
    if (!response || response.__type !== "string" || !response.payload.trim()) {
        return null;
    }

    return response.payload.trim();
}

function answerPrompt(query: string, content: string): string {
    return [
        "You are helping answer a question using the text content of a webpage.",
        "Answer the question using only the content below. If the content does not contain the answer, say so. Return only the answer, without extra commentary.",
        `<question>${query}</question>`,
        `<content>\n${content}\n</content>`,
    ].join("\n\n");
}

function notesPrompt(query: string, content: string, part: number, total: number): string {
    return [
        `You are reading part ${part} of ${total} of a long webpage in order to answer a question later.`,
        "Extract the facts, figures and quotes from this part that are relevant to the question. If nothing is relevant, reply with the single word NONE. Return only the extracted notes.",
        `<question>${query}</question>`,
        `<content>\n${content}\n</content>`,
    ].join("\n\n");
}
