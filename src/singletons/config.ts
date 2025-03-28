/* eslint-disable @typescript-eslint/no-explicit-any */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { HennosConsumer } from "./base";
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

    static get HENNOS_FOLLOW_UP_ENABLED(): number[] | false {
        if (!process.env.HENNOS_FOLLOW_UP_ENABLED) {
            return false;
        }

        const ids = process.env.HENNOS_FOLLOW_UP_ENABLED.split(",").map((id) => parseInt(id.trim()));
        if (ids.some((id) => Number.isNaN(id))) {
            console.error("Invalid HENNOS_FOLLOW_UP_ENABLED value. Expected a comma-separated list of numbers. Disabling follow-up.");
            return false;
        }

        return ids;
    }


    static get CLASSIFIER_ENABLED(): false | "bayes" | "openai" {
        if (!process.env.CLASSIFIER_ENABLED) {
            return false;
        }

        if (process.env.CLASSIFIER_ENABLED === "bayes") {
            return "bayes";
        }

        if (process.env.CLASSIFIER_ENABLED === "openai") {
            return "openai";
        }

        return false;
    }

    static get TWITCH_ENABLED(): boolean {
        if (!process.env.TWITCH_ENABLED) {
            return false;
        }

        return process.env.TWITCH_ENABLED === "true";
    }

    static get TWITCH_BOT_TOKEN(): string {
        if (!process.env.TWITCH_BOT_TOKEN) {
            throw new Error("Missing TWITCH_BOT_TOKEN");
        }

        return process.env.TWITCH_BOT_TOKEN;
    }

    static get TWITCH_BOT_USERNAME(): string {
        if (!process.env.TWITCH_BOT_USERNAME) {
            throw new Error("Missing TWITCH_BOT_USERNAME");
        }

        return process.env.TWITCH_BOT_USERNAME;
    }

    static get TWITCH_BOT_ADMIN(): string {
        if (!process.env.TWITCH_BOT_ADMIN) {
            throw new Error("Missing TWITCH_BOT_ADMIN");
        }

        return process.env.TWITCH_BOT_ADMIN;
    }

    static get TWITCH_JOIN_CHANNELS(): string[] {
        if (!process.env.TWITCH_JOIN_CHANNELS) {
            return [];
        }

        const value = process.env.TWITCH_JOIN_CHANNELS;
        const array = value.split(",").map((channel) => channel.trim());
        return array;
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

    static get MISTRAL_LLM(): HennosModelConfig {
        if (!process.env.MISTRAL_LLM) {
            return {
                MODEL: "mistral-small-latest",
                CTX: 10000,
            };
        }
        return parseHennosModelString(process.env.MISTRAL_LLM, "MISTRAL_LLM");
    }

    static get GOOGLE_LLM(): HennosModelConfig {
        if (!process.env.GOOGLE_LLM) {
            return {
                MODEL: "gemini-1.5-flash",
                CTX: 65000,
            };
        }
        return parseHennosModelString(process.env.GOOGLE_LLM, "GOOGLE_LLM");
    }

    static get WHISPER_MODEL(): string {
        if (!process.env.WHISPER_MODEL) {
            return "base.en";
        }

        return process.env.WHISPER_MODEL;
    }

    static get WHISPER_MAX_PARALLEL(): number {
        if (!process.env.WHISPER_MAX_PARALLEL) {
            return 1;
        }

        const max = parseInt(process.env.WHISPER_MAX_PARALLEL);

        if (Number.isNaN(max)) {
            throw new Error("Invalid WHISPER_MAX_PARALLEL value");
        }

        return max;
    }

    static get OPENAI_BASE_URL(): string | undefined {
        if (!process.env.OPENAI_BASE_URL) {
            return undefined;
        }

        return process.env.OPENAI_BASE_URL;
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

    static get MISTRAL_API_KEY(): string {
        if (!process.env.MISTRAL_API_KEY) {
            throw new Error("Missing MISTRAL_API_KEY");
        }

        return process.env.MISTRAL_API_KEY;
    }

    static get GOOGLE_API_KEY(): string {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error("Missing GOOGLE_API_KEY");
        }

        return process.env.GOOGLE_API_KEY;
    }

    static get OPENAI_LLM(): HennosModelConfig {
        if (!process.env.OPENAI_LLM) {
            return {
                MODEL: "gpt-4o-mini",
                CTX: 32000,
            };
        }

        return parseHennosModelString(process.env.OPENAI_LLM, "OPENAI_LLM");
    }

    static get OPENAI_MINI_LLM(): HennosModelConfig {
        return {
            MODEL: "gpt-4o-mini",
            CTX: 16000,
        };
    }

    static get OPENAI_LLM_REASONING(): HennosModelConfig {
        if (!process.env.OPENAI_LLM_REASONING) {
            return {
                MODEL: "o1-mini",
                CTX: 32000,
            };
        }
        return parseHennosModelString(process.env.OPENAI_LLM_REASONING, "OPENAI_LLM_REASONING");
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

    static get WS_SERVER_PORT(): number {
        if (!process.env.WS_SERVER_PORT) {
            return 16006;
        }

        const port = parseInt(process.env.WS_SERVER_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid WS_SERVER_PORT value");
        }

        return port;
    }

    static get WS_SERVER_ENABLED(): boolean {
        if (!process.env.WS_SERVER_ENABLED) {
            return false;
        }

        return process.env.WS_SERVER_ENABLED === "true";
    }

    static get WS_SERVER_TOKEN(): string {
        if (!process.env.WS_SERVER_TOKEN) {
            throw new Error("Missing WS_SERVER_TOKEN");
        }

        return process.env.WS_SERVER_TOKEN;
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

    static get THE_NEWS_API_KEY(): string | false {
        if (!process.env.THE_NEWS_API_KEY) {
            return false;
        }

        return process.env.THE_NEWS_API_KEY;
    }

    static get LAST_FM_API_KEY(): string | false {
        if (!process.env.LAST_FM_API_KEY) {
            return false;
        }

        return process.env.LAST_FM_API_KEY;
    }


    static get GITHUB_API_KEY(): string | false {
        if (!process.env.GITHUB_API_KEY) {
            return false;
        }

        return process.env.GITHUB_API_KEY;
    }

    static get THE_MOVIE_DB_API_KEY(): string | false {
        if (!process.env.THE_MOVIE_DB_API_KEY) {
            return false;
        }

        return process.env.THE_MOVIE_DB_API_KEY;
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

    static LOCAL_STORAGE(req?: HennosConsumer): string {
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


    static get COMFY_UI_ADDRESS(): string | false {
        if (!process.env.COMFY_UI_ADDRESS) {
            return false;
        }

        // If this has a leading http:// or https://, remove it
        if (process.env.COMFY_UI_ADDRESS.startsWith("http://")) {
            return process.env.COMFY_UI_ADDRESS.replace("http://", "");
        }

        if (process.env.COMFY_UI_ADDRESS.startsWith("https://")) {
            return process.env.COMFY_UI_ADDRESS.replace("https://", "");
        }

        return process.env.COMFY_UI_ADDRESS;
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