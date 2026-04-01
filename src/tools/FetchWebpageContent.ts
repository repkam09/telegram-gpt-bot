import fs from "node:fs/promises";
import path from "node:path";

import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";
import { isProbablyReaderable, Readability } from "@mozilla/readability";
import { Tool } from "ollama";
import { HTMLReader } from "@llamaindex/readers/html";
import { OpenAI, OpenAIEmbedding } from "@llamaindex/openai";
import {
    BaseReader,
    getResponseSynthesizer,
    SentenceSplitter,
    Settings,
    SummaryIndex,
    SummaryRetrieverMode,
} from "llamaindex";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Ollama, OllamaEmbedding } from "@llamaindex/ollama";


if (Config.HENNOS_DOCUMENT_EMBED_PROVIDER === "ollama") {
    Logger.info("DocumentProcessing", "Initializing Ollama embedding model for document processing");
    Settings.embedModel = new OllamaEmbedding({
        model: Config.OLLAMA_LLM_EMBED.MODEL,
        config: {
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        }
    });
} else {
    Logger.info("DocumentProcessing", "Initializing OpenAI embedding model for document processing");
    Settings.embedModel = new OpenAIEmbedding({
        model: Config.OPENAI_LLM_EMBED.MODEL,
        apiKey: Config.OPENAI_API_KEY
    });

}

if (Config.HENNOS_DOCUMENT_LLM_PROVIDER === "ollama") {
    Logger.info("DocumentProcessing", "Initializing Ollama LLM model for document processing");
    Settings.llm = new Ollama({
        model: Config.OLLAMA_LLM.MODEL,
        config: {
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        }
    });
} else {
    Logger.info("DocumentProcessing", "Initializing OpenAI LLM model for document processing");
    Settings.llm = new OpenAI({
        model: Config.OPENAI_MINI_LLM.MODEL,
        apiKey: Config.OPENAI_API_KEY,
        temperature: 1
    });
}

Settings.chunkOverlap = 256;
Settings.chunkSize = 2048;

Settings.nodeParser = new SentenceSplitter({
    chunkOverlap: 256,
    chunkSize: 2048,
});

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
            return [JSON.stringify({ error: "required parameter 'url' not provided" }), metadata];
        }

        Logger.info(workflowId, `fetch_webpage_content, url=${args.url}, query=${args.query}`);
        try {
            const html = await fetchPageContent(workflowId, args.url);

            // If the HTML is smaller than 32000 chars we can just return the whole thing
            if (!args.query && html.length < 32000) {
                return [html, metadata];
            }

            const filePath = path.join(Config.LOCAL_STORAGE(workflowId), "/", `${Date.now().toString()}.html`);

            await fs.writeFile(filePath, html, { encoding: "utf-8" });

            const query = args.query ? args.query : "Provide a summary of this document.";
            const result = await handleDocument(workflowId, filePath, args.url, new HTMLReader(), query);
            return [JSON.stringify({ summary: result }), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `fetch_webpage_content error url=${args.url} error=${error.message}`, error);
            return [JSON.stringify({ error: `unable to fetch content from URL '${args.url}'` }), metadata];
        }
    }
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


export async function handleDocument(workflowId: string, path: string, uuid: string, reader: BaseReader, prompt?: string): Promise<string> {
    Logger.info(workflowId, `Processing document at path: ${path} with UUID: ${uuid}.`);

    const documents = await reader.loadData(path);

    Logger.debug(workflowId, `Loaded ${documents.length} documents from path: ${path} with UUID: ${uuid}.`);
    const index = await SummaryIndex.fromDocuments(documents);

    Logger.debug(workflowId, `Created a summary index from ${documents.length} documents at path: ${path} with UUID: ${uuid}.`);
    const queryEngine = index.asQueryEngine({
        responseSynthesizer: getResponseSynthesizer("tree_summarize"),
        retriever: index.asRetriever({
            mode: SummaryRetrieverMode.DEFAULT,
        })
    });

    Logger.debug(workflowId, `Created a query engine from the summary index at path: ${path} with UUID: ${uuid}.`);
    const response = await queryEngine.query({
        query: prompt ? prompt : "Can you provide a summary of this document?"
    });

    Logger.debug(workflowId, `Queried the query engine from the summary index at path: ${path} with UUID: ${uuid}.`);
    const summary = response.toString();

    Logger.debug(workflowId,
        `Extracted summary content length: ${summary.length} characters. Contents: ${summary.substring(0, 500)}...`,
    );

    Logger.info(workflowId, `Completed processing document at path: ${path} with UUID: ${uuid}.`);
    return summary;
}