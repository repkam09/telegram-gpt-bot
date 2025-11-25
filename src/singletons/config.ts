/* eslint-disable @typescript-eslint/no-explicit-any */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { PuppeteerLifeCycleEvent } from "puppeteer";

dotenv.config();

export type HennosModelConfig = {
    MODEL: any
    CTX: number
}

export type HennosEmbeddingModelConfig = {
    MODEL: any
    CTX: number
}

export class Config {
    static get HENNOS_DEVELOPMENT_MODE(): boolean {
        if (!process.env.HENNOS_DEVELOPMENT_MODE) {
            return false;
        }

        if (process.env.HENNOS_DEVELOPMENT_MODE !== "true") {
            return false;
        }

        if (Config.TELEGRAM_BOT_ADMIN === -1) {
            throw new Error("Missing TELEGRAM_BOT_ADMIN for HENNOS_DEVELOPMENT_MODE");
        }

        return true;
    }

    static get HENNOS_VERBOSE_LOGGING(): boolean {
        if (!process.env.HENNOS_VERBOSE_LOGGING) {
            return false;
        }

        return process.env.HENNOS_VERBOSE_LOGGING === "true";
    }

    static get TELEGRAM_ENABLED(): boolean {
        if (!process.env.TELEGRAM_ENABLED) {
            return false;
        }

        return process.env.TELEGRAM_ENABLED === "true";
    }

    static get DISCORD_ENABLED(): boolean {
        if (!process.env.DISCORD_ENABLED) {
            return false;
        }

        return process.env.DISCORD_ENABLED === "true";
    }

    static get DISCORD_BOT_TOKEN(): string {
        if (!process.env.DISCORD_BOT_TOKEN) {
            throw new Error("Missing DISCORD_BOT_TOKEN");
        }

        return process.env.DISCORD_BOT_TOKEN;
    }

    static get VTUBE_STUDIO_ENABLED(): boolean {
        if (!process.env.VTUBE_STUDIO_ENABLED) {
            return false;
        }

        return process.env.VTUBE_STUDIO_ENABLED === "true";
    }

    static get VTUBE_STUDIO_PORT(): number {
        if (!process.env.VTUBE_STUDIO_PORT) {
            return 8001;
        }

        const port = parseInt(process.env.VTUBE_STUDIO_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid VTUBE_STUDIO_PORT value");
        }

        return port;
    }

    static get VTUBE_STUDIO_HOST(): string {
        if (!process.env.VTUBE_STUDIO_HOST) {
            return "localhost";
        }

        return process.env.VTUBE_STUDIO_HOST;
    }

    static get WEBHOOK_ENABLED(): boolean {
        if (!process.env.WEBHOOK_ENABLED) {
            return false;
        }

        return process.env.WEBHOOK_ENABLED === "true";
    }

    static get WEBHOOK_PORT(): number {
        if (!process.env.WEBHOOK_PORT) {
            return 3000;
        }

        const port = parseInt(process.env.WEBHOOK_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid WEBHOOK_PORT value");
        }

        return port;
    }

    static get OLLAMA_LLM(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM) {
            return {
                MODEL: "qwen2.5:14b",
                CTX: 16000,
            };
        }
        return parseHennosModelString(process.env.OLLAMA_LLM, "OLLAMA_LLM");
    }

    static get OLLAMA_LLM_EMBED(): HennosEmbeddingModelConfig {
        if (!process.env.OLLAMA_LLM_EMBED) {
            return {
                MODEL: "nomic-embed-text:latest",
                CTX: 8192,
            };
        }

        const parts = process.env.OLLAMA_LLM_EMBED.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OLLAMA_LLM_EMBED");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get OLLAMA_HOST(): string {
        if (!process.env.OLLAMA_HOST) {
            return "localhost";
        }

        return process.env.OLLAMA_HOST;
    }

    static get OPENAI_API_KEY(): string {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        return process.env.OPENAI_API_KEY;
    }

    static get GOOGLE_API_KEY(): string {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error("Missing GOOGLE_API_KEY");
        }

        return process.env.GOOGLE_API_KEY;
    }

    static get GOOGLE_IMAGE_MODEL(): string {
        if (!process.env.GOOGLE_IMAGE_MODEL) {
            return "gemini-3-pro-image-preview";
        }

        return process.env.GOOGLE_IMAGE_MODEL;
    }

    static get OPENAI_IMAGE_MODEL(): string {
        if (!process.env.OPENAI_IMAGE_MODEL) {
            return "gpt-image-1";
        }

        return process.env.OPENAI_IMAGE_MODEL;
    }

    static get OPENAI_LLM(): HennosModelConfig {
        if (!process.env.OPENAI_LLM) {
            return {
                MODEL: "gpt-5-nano",
                CTX: 32000,
            };
        }

        return parseHennosModelString(process.env.OPENAI_LLM, "OPENAI_LLM");
    }

    static get OPENAI_MINI_LLM(): HennosModelConfig {
        return {
            MODEL: "gpt-5-nano",
            CTX: 16000,
        };
    }

    static get OPENAI_LLM_EMBED(): HennosEmbeddingModelConfig {
        if (!process.env.OPENAI_LLM_EMBED) {
            return {
                MODEL: "text-embedding-3-small",
                CTX: 8191
            };
        }

        const parts = process.env.OPENAI_LLM_EMBED.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OPENAI_LLM_EMBED");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get ANTHROPIC_API_KEY(): string {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error("Missing ANTHROPIC_API_KEY");
        }

        return process.env.ANTHROPIC_API_KEY;
    }

    static get ANTHROPIC_LLM(): HennosModelConfig {
        if (!process.env.ANTHROPIC_LLM) {
            return {
                MODEL: "claude-3-haiku-20240307",
                CTX: 16000
            };
        }

        return parseHennosModelString(process.env.ANTHROPIC_LLM, "ANTHROPIC_LLM");
    }

    static get AWS_BEDROCK_LLM(): HennosModelConfig {
        if (!process.env.AWS_BEDROCK_LLM) {
            return {
                MODEL: "amazon.nova-micro-v1:0",
                CTX: 16000
            };
        }

        return parseHennosModelString(process.env.AWS_BEDROCK_LLM, "AWS_BEDROCK_LLM");
    }

    static get AWS_BEARER_TOKEN_BEDROCK(): string {
        if (!process.env.AWS_BEARER_TOKEN_BEDROCK) {
            throw new Error("Missing AWS_BEARER_TOKEN_BEDROCK");
        }

        return process.env.AWS_BEARER_TOKEN_BEDROCK;
    }

    static get AWS_BEDROCK_REGION(): string {
        if (!process.env.AWS_BEDROCK_REGION) {
            return "us-east-1";
        }

        return process.env.AWS_BEDROCK_REGION;
    }

    static get OLLAMA_PORT(): number {
        if (!process.env.OLLAMA_PORT) {
            return 11434;
        }

        const port = parseInt(process.env.OLLAMA_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid OLLAMA_PORT value");
        }

        return port;
    }

    static get QDRANT_ENABLED(): boolean {
        if (!process.env.QDRANT_ENABLED) {
            return false;
        }

        return process.env.QDRANT_ENABLED === "true";
    }

    static get QDRANT_HOST(): string {
        if (!process.env.QDRANT_HOST) {
            return "localhost";
        }

        return process.env.QDRANT_HOST;
    }

    static get QDRANT_PORT(): number {
        if (!process.env.QDRANT_PORT) {
            return 6333;
        }

        const port = parseInt(process.env.QDRANT_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid QDRANT_PORT value");
        }

        return port;
    }

    static get TERRARIUM_ENABLED(): boolean {
        if (!process.env.TERRARIUM_ENABLED) {
            return false;
        }

        return process.env.TERRARIUM_ENABLED === "true";
    }

    static get TERRARIUM_HOST(): string {
        if (!process.env.TERRARIUM_HOST) {
            return "localhost";
        }

        return process.env.TERRARIUM_HOST;
    }

    static get TERRARIUM_PORT(): number {
        if (!process.env.TERRARIUM_PORT) {
            return 8080;
        }

        const port = parseInt(process.env.TERRARIUM_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid TERRARIUM_PORT value");
        }

        return port;
    }

    static get TELEGRAM_BOT_KEY(): string {
        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        return process.env.TELEGRAM_BOT_KEY;
    }

    static get HENNOS_BOT_NAME(): string {
        if (!process.env.HENNOS_BOT_NAME) {
            return "Hennos";
        }

        return process.env.HENNOS_BOT_NAME;
    }

    static get HENNOS_TOOL_DEPTH(): number {
        if (!process.env.HENNOS_TOOL_DEPTH) {
            return 8;
        }

        const depth = parseInt(process.env.HENNOS_TOOL_DEPTH);

        if (Number.isNaN(depth)) {
            throw new Error("Invalid HENNOS_TOOL_DEPTH value");
        }

        return depth;
    }

    static get OPEN_WEATHER_API(): string | false {
        if (!process.env.OPEN_WEATHER_API) {
            return false;
        }

        return process.env.OPEN_WEATHER_API;
    }

    static get WOLFRAM_ALPHA_APP_ID(): string | false {
        if (!process.env.WOLFRAM_ALPHA_APP_ID) {
            return false;
        }

        return process.env.WOLFRAM_ALPHA_APP_ID;
    }

    static get GITHUB_API_KEY(): string | false {
        if (!process.env.GITHUB_API_KEY) {
            return false;
        }

        return process.env.GITHUB_API_KEY;
    }

    static get BRAVE_SEARCH_API_KEY(): string | false {
        if (!process.env.BRAVE_SEARCH_API_KEY) {
            return false;
        }

        return process.env.BRAVE_SEARCH_API_KEY;
    }

    static get JELLYSEER_API_KEY(): string | false {
        if (!process.env.JELLYSEER_API_KEY) {
            return false;
        }

        return process.env.JELLYSEER_API_KEY;
    }

    static get JELLYSEER_BASE_URL(): string {
        if (!process.env.JELLYSEER_BASE_URL) {
            return "localhost:5055";
        }

        return process.env.JELLYSEER_BASE_URL;
    }

    static get JELLYFIN_BASE_URL(): string | false {
        if (!process.env.JELLYFIN_BASE_URL) {
            return false;
        }

        return process.env.JELLYFIN_BASE_URL;
    }

    static get HOME_ASSISTANT_BASE_URL(): string | false {
        if (!process.env.HOME_ASSISTANT_BASE_URL) {
            return false;
        }

        return process.env.HOME_ASSISTANT_BASE_URL;
    }

    static get HOME_ASSISTANT_API_KEY(): string | false {
        if (!process.env.HOME_ASSISTANT_API_KEY) {
            return false;
        }

        return process.env.HOME_ASSISTANT_API_KEY;
    }

    static get PUPPETEER_HEADLESS(): boolean {
        if (!process.env.PUPPETEER_HEADLESS) {
            return true;
        }

        if (process.env.PUPPETEER_HEADLESS === "false") {
            return false;
        }

        return true;
    }

    static get PUPPETEER_WAIT_UNTIL(): PuppeteerLifeCycleEvent {
        if (!process.env.PUPPETEER_WAIT_UNTIL) {
            return "networkidle2";
        }

        return "networkidle2";
    }

    static get TELEGRAM_GROUP_PREFIX(): string {
        if (!process.env.TELEGRAM_GROUP_PREFIX) {
            throw new Error("Missing TELEGRAM_GROUP_PREFIX");
        }

        if (process.env.TELEGRAM_GROUP_PREFIX === "") {
            throw new Error("Invalid TELEGRAM_GROUP_PREFIX");
        }

        if (process.env.TELEGRAM_GROUP_PREFIX.startsWith("@")) {
            throw new Error("Invalid TELEGRAM_GROUP_PREFIX");
        }

        return process.env.TELEGRAM_GROUP_PREFIX;
    }

    static get TELEGRAM_GROUP_CONTEXT(): boolean {
        if (!process.env.TELEGRAM_GROUP_CONTEXT) {
            return false;
        }

        return process.env.TELEGRAM_GROUP_CONTEXT === "true";
    }

    static get TELEGRAM_BOT_ADMIN(): number {
        if (!process.env.TELEGRAM_BOT_ADMIN) {
            return -1;
        }

        const adminId = parseInt(process.env.TELEGRAM_BOT_ADMIN);
        if (Number.isNaN(adminId)) {
            throw new Error("Invalid TELEGRAM_BOT_ADMIN");
        }

        return adminId;
    }

    static get TEMPORAL_ENABLED(): boolean {
        if (!process.env.TEMPORAL_ENABLED) {
            return false;
        }

        return process.env.TEMPORAL_ENABLED === "true";
    }

    static get TEMPORAL_HOST(): string {
        if (!process.env.TEMPORAL_HOST) {
            return "localhost";
        }

        return process.env.TEMPORAL_HOST;
    }

    static get TEMPORAL_PORT(): number {
        if (!process.env.TEMPORAL_PORT) {
            return 7233;
        }

        const port = parseInt(process.env.TEMPORAL_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid TEMPORAL_PORT value");
        }

        return port;
    }

    static get TEMPORAL_NAMESPACE(): string {
        if (!process.env.TEMPORAL_NAMESPACE) {
            return "default";
        }

        return process.env.TEMPORAL_NAMESPACE;
    }

    static get TEMPORAL_TASK_QUEUE(): string {
        if (!process.env.TEMPORAL_TASK_QUEUE) {
            return "development";
        }

        return process.env.TEMPORAL_TASK_QUEUE;
    }

    static get LIFEFORCE_AUTH_TOKEN(): string {
        if (!process.env.LIFEFORCE_AUTH_TOKEN) {
            throw new Error("Missing LIFEFORCE_AUTH_TOKEN");
        }

        return process.env.LIFEFORCE_AUTH_TOKEN;
    }

    static get LIFEFORCE_BASE_URL(): string {
        if (!process.env.LIFEFORCE_BASE_URL) {
            return "https://api.repkam09.com";
        }

        return process.env.LIFEFORCE_BASE_URL;
    }

    static get LIFEFORCE_ENABLED(): boolean {
        if (!process.env.LIFEFORCE_ENABLED) {
            return false;
        }

        return process.env.LIFEFORCE_ENABLED === "true";
    }

    static LOCAL_STORAGE(req?: { chatId: number }): string {
        if (!process.env.LOCAL_STORAGE) {
            return os.tmpdir();
        }

        const cwd = path.join(__dirname, "../", "../");
        if (req) {
            const dir = path.join(cwd, process.env.LOCAL_STORAGE, String(req.chatId));
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }

            return dir;
        }

        const dir = path.join(cwd, process.env.LOCAL_STORAGE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        return dir;
    }

    static get PERPLEXITY_API_KEY(): string | false {
        if (!process.env.PERPLEXITY_API_KEY) {
            return false;
        }

        return process.env.PERPLEXITY_API_KEY;
    }

    static get PERPLEXITY_MODEL(): string {
        if (!process.env.PERPLEXITY_MODEL) {
            return "sonar";
        }

        return process.env.PERPLEXITY_MODEL;
    }
}


function parseHennosModelString(value: string, env: string): HennosModelConfig {
    const parts = value.split(",");

    if (parts.length !== 2) {
        throw new Error(`Invalid value for ${env}`);
    }

    const ctxInLength = parseInt(parts[1]);

    if (Number.isNaN(ctxInLength)) {
        throw new Error("Invalid context length value for " + env);
    }

    return {
        MODEL: parts[0],
        CTX: ctxInLength,
    };
}