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

export class Config {
    static get HENNOS_DEVELOPMENT_MODE(): boolean {
        if (!process.env.HENNOS_DEVELOPMENT_MODE) {
            return false;
        }

        return process.env.HENNOS_DEVELOPMENT_MODE === "true";
    }

    static get HENNOS_VERBOSE_LOGGING(): boolean {
        if (!process.env.HENNOS_VERBOSE_LOGGING) {
            return false;
        }

        return process.env.HENNOS_VERBOSE_LOGGING === "true";
    }

    static get HENNOS_LLM_PROVIDER(): string {
        if (!process.env.HENNOS_LLM_PROVIDER) {
            return "openai";
        }

        return process.env.HENNOS_LLM_PROVIDER;
    }

    static get HENNOS_GMAIL_ENABLED(): boolean {
        if (!process.env.HENNOS_GMAIL_ENABLED) {
            return false;
        }

        return process.env.HENNOS_GMAIL_ENABLED === "true";
    }

    static get HENNOS_BLUESKY_ENABLED(): boolean {
        if (!process.env.HENNOS_BLUESKY_ENABLED) {
            return false;
        }

        return process.env.HENNOS_BLUESKY_ENABLED === "true";
    }

    static get HENNOS_TELEGRAM_ENABLED(): boolean {
        if (!process.env.HENNOS_TELEGRAM_ENABLED) {
            return false;
        }

        return process.env.HENNOS_TELEGRAM_ENABLED === "true";
    }

    static get HENNOS_DISCORD_ENABLED(): boolean {
        if (!process.env.HENNOS_DISCORD_ENABLED) {
            return false;
        }

        return process.env.HENNOS_DISCORD_ENABLED === "true";
    }

    static get HENNOS_SLACK_ENABLED(): boolean {
        if (!process.env.HENNOS_SLACK_ENABLED) {
            return false;
        }

        return process.env.HENNOS_SLACK_ENABLED === "true";
    }

    static get HENNOS_API_ENABLED(): boolean {
        if (!process.env.HENNOS_API_ENABLED) {
            return false;
        }

        return process.env.HENNOS_API_ENABLED === "true";
    }

    static get HENNOS_API_PORT(): number {
        if (!process.env.HENNOS_API_PORT) {
            return 16006;
        }

        const port = parseInt(process.env.HENNOS_API_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid HENNOS_API_PORT value");
        }

        return port;
    }

    static get TELEGRAM_BOT_WEBHOOK_EXTERNAL(): string | false {
        if (!process.env.TELEGRAM_BOT_WEBHOOK_EXTERNAL) {
            return false;
        }

        return process.env.TELEGRAM_BOT_WEBHOOK_EXTERNAL;
    }

    static get OPENAI_API_KEY(): string {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        return process.env.OPENAI_API_KEY;
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

    static get OPENAI_TRANSCRIPTION_MODEL(): string {
        if (!process.env.OPENAI_TRANSCRIPTION_MODEL) {
            return "whisper-1";
        }

        return process.env.OPENAI_TRANSCRIPTION_MODEL;
    }

    static get OPENAI_TEXT_TO_SPEECH_MODEL(): string {
        if (!process.env.OPENAI_TEXT_TO_SPEECH_MODEL) {
            return "gpt-4o-mini-tts";
        }

        return process.env.OPENAI_TEXT_TO_SPEECH_MODEL;
    }

    static get OPENAI_LLM_EMBED(): { MODEL: string } {
        if (!process.env.OPENAI_LLM_EMBED) {
            return {
                MODEL: "text-embedding-3-small"
            };
        }

        return {
            MODEL: process.env.OPENAI_LLM_EMBED,
        };
    }

    static get OPENAI_MINI_LLM(): HennosModelConfig {
        return {
            MODEL: "gpt-5-mini",
            CTX: 16000,
        };
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

    static get ANTHROPIC_API_KEY(): string {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error("Missing ANTHROPIC_API_KEY");
        }

        return process.env.ANTHROPIC_API_KEY;
    }

    static get ANTHROPIC_LLM(): HennosModelConfig {
        if (!process.env.ANTHROPIC_LLM) {
            return {
                MODEL: "claude-opus-4-6",
                CTX: 16000
            };
        }

        return parseHennosModelString(process.env.ANTHROPIC_LLM, "ANTHROPIC_LLM");
    }

    static get ANTHROPIC_MINI_LLM(): HennosModelConfig {
        if (!process.env.ANTHROPIC_MINI_LLM) {
            return {
                MODEL: "claude-haiku-4-5",
                CTX: 16000,
            };
        }

        return parseHennosModelString(process.env.ANTHROPIC_MINI_LLM, "ANTHROPIC_MINI_LLM");
    }

    static get OLLAMA_HOST(): string {
        if (!process.env.OLLAMA_HOST) {
            return "localhost";
        }

        return process.env.OLLAMA_HOST;
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

    static get DISCORD_BOT_TOKEN(): string {
        if (!process.env.DISCORD_BOT_TOKEN) {
            throw new Error("Missing DISCORD_BOT_TOKEN");
        }

        return process.env.DISCORD_BOT_TOKEN;
    }

    static get SLACK_BOT_TOKEN(): string {
        if (!process.env.SLACK_BOT_TOKEN) {
            throw new Error("Missing SLACK_BOT_TOKEN");
        }

        return process.env.SLACK_BOT_TOKEN;
    }

    static get SLACK_SIGNING_SECRET(): string {
        if (!process.env.SLACK_SIGNING_SECRET) {
            throw new Error("Missing SLACK_SIGNING_SECRET");
        }

        return process.env.SLACK_SIGNING_SECRET;
    }

    static get SLACK_APP_TOKEN(): string {
        if (!process.env.SLACK_APP_TOKEN) {
            throw new Error("Missing SLACK_APP_TOKEN");
        }

        return process.env.SLACK_APP_TOKEN;
    }

    static get TELEGRAM_BOT_KEY(): string {
        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        return process.env.TELEGRAM_BOT_KEY;
    }

    static get TELEGRAM_BOT_ADMIN(): string | false {
        if (!process.env.TELEGRAM_BOT_ADMIN) {
            return false;
        }

        return process.env.TELEGRAM_BOT_ADMIN;
    }

    static get GMAIL_CLIENT_ID(): string {
        if (!process.env.GMAIL_CLIENT_ID) {
            throw new Error("Missing GMAIL_CLIENT_ID");
        }

        return process.env.GMAIL_CLIENT_ID;
    }

    static get GMAIL_CLIENT_SECRET(): string {
        if (!process.env.GMAIL_CLIENT_SECRET) {
            throw new Error("Missing GMAIL_CLIENT_SECRET");
        }

        return process.env.GMAIL_CLIENT_SECRET;
    }

    static get GMAIL_REFRESH_TOKEN(): string {
        if (!process.env.GMAIL_REFRESH_TOKEN) {
            throw new Error("Missing GMAIL_REFRESH_TOKEN");
        }

        return process.env.GMAIL_REFRESH_TOKEN;
    }

    static get AT_PROTO_SERVICE(): string {
        if (!process.env.AT_PROTO_SERVICE) {
            return "https://bsky.social";
        }

        return process.env.AT_PROTO_SERVICE;
    }

    static get AT_PROTO_USERNAME(): string {
        if (!process.env.AT_PROTO_USERNAME) {
            throw new Error("Missing AT_PROTO_USERNAME");
        }

        return process.env.AT_PROTO_USERNAME;
    }

    static get AT_PROTO_PASSWORD(): string {
        if (!process.env.AT_PROTO_PASSWORD) {
            throw new Error("Missing AT_PROTO_PASSWORD");
        }

        return process.env.AT_PROTO_PASSWORD;
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

    static get AXIOM_API_KEY(): string | false {
        if (!process.env.AXIOM_API_KEY) {
            return false;
        }

        return process.env.AXIOM_API_KEY;
    }

    static get AXIOM_DATASET(): string | false {
        if (!process.env.AXIOM_DATASET) {
            return false;
        }

        return process.env.AXIOM_DATASET;
    }

    static LOCAL_STORAGE(workflowId: string): string {
        if (!process.env.LOCAL_STORAGE) {
            return os.tmpdir();
        }

        const cwd = path.join(__dirname, "../", "../");
        if (workflowId) {
            const dir = path.join(cwd, process.env.LOCAL_STORAGE, workflowId);
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