import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { HennosGroup } from "./group";
import { HennosUser } from "./user";
dotenv.config();

export type HennosModelConfig = {
    MODEL: string
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

    static get OLLAMA_LLM(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM) {
            return {
                MODEL: "llama3:latest",
                CTX: 8192
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
                MODEL: "phi3:latest,128000",
                CTX: 8192
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

    static get OLLAMA_LLM_VISION(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM_VISION) {
            return {
                MODEL: "llava:7b",
                CTX: 20480
            };
        }

        const parts = process.env.OLLAMA_LLM_VISION.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OLLAMA_LLM_VISION");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
    }


    static get OLLAMA_LLM_EMBED(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM_EMBED) {
            return {
                MODEL: "phi3:latest,128000",
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
                MODEL: "gpt-3.5-turbo",
                CTX: 16000
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

    static get OPENAI_LLM_VISION(): HennosModelConfig {
        if (!process.env.OPENAI_LLM_VISION) {
            return {
                MODEL: "gpt-4o",
                CTX: 32000
            };
        }

        const parts = process.env.OPENAI_LLM_VISION.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for OPENAI_LLM_VISION");
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
                CTX: 200000
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

    static get ANTHROPIC_LLM_VISION(): HennosModelConfig {
        if (!process.env.ANTHROPIC_LLM_VISION) {
            return {
                MODEL: "claude-3-haiku-20240307",
                CTX: 200000
            };
        }

        const parts = process.env.ANTHROPIC_LLM_VISION.split(",");
        const ctx = parseInt(parts[1]);

        if (Number.isNaN(ctx)) {
            throw new Error("Invalid context length value for ANTHROPIC_LLM_VISION");
        }

        return {
            MODEL: parts[0],
            CTX: ctx
        };
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

    static get OPEN_WEATHER_API(): string | false {
        if (!process.env.OPEN_WEATHER_API) {
            return false;
        }

        return process.env.OPEN_WEATHER_API;
    }

    static get TELEGRAM_GROUP_PREFIX(): string {
        if (!process.env.TELEGRAM_GROUP_PREFIX) {
            throw new Error("Missing TELEGRAM_GROUP_PREFIX");
        }

        return process.env.TELEGRAM_GROUP_PREFIX + " ";
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

    static LOCAL_STORAGE(user?: HennosUser | HennosGroup): string {
        if (!process.env.LOCAL_STORAGE) {
            return os.tmpdir();
        }

        const cwd = path.join(__dirname, "../", "../");
        if (user) {
            const dir = path.join(cwd, process.env.LOCAL_STORAGE, String(user.chatId));
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
