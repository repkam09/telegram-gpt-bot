import * as dotenv from "dotenv";
dotenv.config();

import { Logger } from "./logger";

export class Config {
    static validate() {
        Logger.info(`OPENAI_API_LLM: ${Config.OPENAI_API_LLM}`);
        Logger.info(`OLLAMA_LLM: ${Config.OLLAMA_LLM}`);

        Logger.info(`HENNOS_MAX_TOKENS: ${Config.HENNOS_MAX_TOKENS}`);
        Logger.info(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);
        Logger.info(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    }

    static get HENNOS_MAX_TOKENS(): number {
        if (!process.env.HENNOS_MAX_TOKENS) {
            return 4096;
        }

        const limit = parseInt(process.env.HENNOS_MAX_TOKENS);

        if (Number.isNaN(limit)) {
            throw new Error("Invalid HENNOS_MAX_TOKENS value");
        }

        return limit;
    }

    static get HENNOS_DEVELOPMENT_MODE(): boolean {
        if (!process.env.HENNOS_DEVELOPMENT_MODE) {
            return false;
        }

        return process.env.HENNOS_DEVELOPMENT_MODE === "true";
    }

    static get HTTP_SERVER_ENABLED(): boolean {
        if (!process.env.HTTP_SERVER_ENABLED) {
            return false;
        }

        return process.env.HTTP_SERVER_ENABLED === "true";
    }

    static get HENNOS_VERBOSE_LOGGING(): boolean {
        if (!process.env.HENNOS_VERBOSE_LOGGING) {
            return false;
        }

        return process.env.HENNOS_VERBOSE_LOGGING === "true";
    }

    static get OPENAI_API_ORG(): string {
        if (!process.env.OPENAI_API_ORG) {
            throw new Error("Missing OPENAI_API_ORG");
        }

        return process.env.OPENAI_API_ORG;
    }

    static get OPENAI_API_ORG_LIMITED(): string {
        if (!process.env.OPENAI_API_ORG_LIMITED) {
            throw new Error("Missing OPENAI_API_ORG_LIMITED");
        }

        return process.env.OPENAI_API_ORG_LIMITED;
    }

    static get OPENAI_API_KEY_LIMITED(): string {
        if (!process.env.OPENAI_API_KEY_LIMITED) {
            throw new Error("Missing OPENAI_API_KEY_LIMITED");
        }

        return process.env.OPENAI_API_KEY_LIMITED;
    }

    static get OPENAI_API_KEY(): string {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        return process.env.OPENAI_API_KEY;
    }

    static get OPENAI_API_LLM() {
        if (!process.env.OPENAI_API_LLM) {
            throw new Error("Missing OPENAI_API_LLM");
        }

        return process.env.OPENAI_API_LLM;
    }

    static get OLLAMA_LLM(): string {
        if (!process.env.OLLAMA_LLM) {
            return "mistral:7b";
        }

        return process.env.OLLAMA_LLM;
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

    static get TELEGRAM_BOT_KEY(): string {
        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        return process.env.TELEGRAM_BOT_KEY;
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
}
