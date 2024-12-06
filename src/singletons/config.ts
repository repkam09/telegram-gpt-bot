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

        if (Config.DISCORD_BOT_ADMIN === -1) {
            throw new Error("Missing DISCORD_BOT_ADMIN for HENNOS_DEVELOPMENT_MODE");
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
                MODEL: "llama3.2:latest",
                CTX: 16000
            };
        }

        const parts = process.env.OLLAMA_LLM.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OLLAMA_LLM");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get OLLAMA_LLM_LARGE(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM_LARGE) {
            return {
                MODEL: "llama3.2:latest",
                CTX: 16000
            };
        }

        const parts = process.env.OLLAMA_LLM_LARGE.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OLLAMA_LLM_LARGE");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get OPENAI_BASE_URL(): string | undefined {
        if (!process.env.OPENAI_BASE_URL) {
            return undefined;
        }

        return process.env.OPENAI_BASE_URL;
    }


    static get OLLAMA_LLM_EMBED(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM_EMBED) {
            return {
                MODEL: "nomic-embed-text:latest",
                CTX: 8192
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

    static get OPENAI_LLM(): HennosModelConfig {
        if (!process.env.OPENAI_LLM) {
            return {
                MODEL: "gpt-4o-mini",
                CTX: 32000
            };
        }

        const parts = process.env.OPENAI_LLM.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OPENAI_LLM");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get OPENAI_LLM_REASONING(): HennosModelConfig {
        if (!process.env.OPENAI_LLM_REASONING) {
            return {
                MODEL: "o1-mini",
                CTX: 32000
            };
        }

        const parts = process.env.OPENAI_LLM_REASONING.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OPENAI_LLM_REASONING");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get OPENAI_LLM_LARGE(): HennosModelConfig {
        if (!process.env.OPENAI_LLM_LARGE) {
            return {
                MODEL: "gpt-4o-mini",
                CTX: 100000
            };
        }

        const parts = process.env.OPENAI_LLM_LARGE.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OPENAI_LLM_LARGE");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }

    static get OPENAI_LLM_EMBED(): HennosModelConfig {
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

        const parts = process.env.ANTHROPIC_LLM.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for ANTHROPIC_LLM");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
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

    static get TELEGRAM_BOT_KEY(): string {
        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        return process.env.TELEGRAM_BOT_KEY;
    }

    static get DISCORD_BOT_TOKEN(): string {
        if (!process.env.DISCORD_BOT_TOKEN) {
            throw new Error("Missing DISCORD_BOT_TOKEN");
        }

        return process.env.DISCORD_BOT_TOKEN;
    }

    static get DISCORD_DISPLAY_NAME(): string {
        if (!process.env.DISCORD_DISPLAY_NAME) {
            return "Hennos";
        }

        return process.env.DISCORD_DISPLAY_NAME;
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

    static get THE_MOVIE_DB_API_KEY(): string | false {
        if (!process.env.THE_MOVIE_DB_API_KEY) {
            return false;
        }

        return process.env.THE_MOVIE_DB_API_KEY;
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

        return process.env.TELEGRAM_GROUP_PREFIX + " ";
    }

    static get TELEGRAM_GROUP_CONTEXT(): boolean {
        if (!process.env.TELEGRAM_GROUP_CONTEXT) {
            return false;
        }

        if (process.env.TELEGRAM_GROUP_CONTEXT === "true") {
            return true;
        }

        return false;
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

    static get DISCORD_BOT_ADMIN(): number {
        if (!process.env.DISCORD_BOT_ADMIN) {
            return -1;
        }

        const adminId = parseInt(process.env.DISCORD_BOT_ADMIN);
        if (Number.isNaN(adminId)) {
            throw new Error("Invalid DISCORD_BOT_ADMIN");
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
}
