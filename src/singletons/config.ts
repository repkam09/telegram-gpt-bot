import * as dotenv from "dotenv";
dotenv.config();

import { Logger } from "./logger";

export class Config {
    static validate() {
        Logger.info(`OPENAI_API_ORG is configured as ${Config.OPENAI_API_ORG ? "[HIDDEN]" : "error"}`);
        Logger.info(`OPENAI_API_KEY is configured as ${Config.OPENAI_API_KEY ? "[HIDDEN]" : "error"}`);

        Logger.info(`OPENAI_API_LLM is configured as ${Config.OPENAI_API_LLM}`);
        Logger.info(`OLLAMA_LLM is configured as ${Config.OLLAMA_LLM}`);

        Logger.info(`TELEGRAM_BOT_KEY is configured as ${Config.TELEGRAM_BOT_KEY ? "[HIDDEN]" : "error"}`);
        Logger.info(`TELEGRAM_GROUP_PREFIX is configured as ${Config.TELEGRAM_GROUP_PREFIX}`);
        Logger.info(`TELEGRAM_BOT_ADMIN is configured as ${Config.TELEGRAM_BOT_ADMIN}`);
        Logger.info(`TELEGRAM_ID_WHITELIST is configured as ${Config.TELEGRAM_ID_WHITELIST}`);
        Logger.info(`TELEGRAM_ID_BLACKLIST is configured as ${Config.TELEGRAM_ID_BLACKLIST}`);


        Logger.info(`HENNOS_MAX_MESSAGE_MEMORY is configured as ${JSON.stringify(Config.HENNOS_MAX_MESSAGE_MEMORY)}`);
        Logger.info(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
        Logger.info(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

        Logger.info(`USE_PERSISTANT_CACHE is configured as ${JSON.stringify(Config.USE_PERSISTANT_CACHE)}`);
    }

    static get HENNOS_MAX_MESSAGE_MEMORY(): number {
        if (!process.env.HENNOS_MAX_MESSAGE_MEMORY) {
            return 10;
        }

        const limit = parseInt(process.env.HENNOS_MAX_MESSAGE_MEMORY);

        if (Number.isNaN(limit)) {
            throw new Error("Invalid HENNOS_MAX_MESSAGE_MEMORY value");
        }

        return limit;
    }

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

    static get USE_PERSISTANT_CACHE(): false | { host: string, port: number } {
        if (!process.env.HENNOS_REDIS_HOST) {
            return false;
        }

        if (!process.env.HENNOS_REDIS_PORT) {
            return false;
        }

        const host = process.env.HENNOS_REDIS_HOST.trim();
        const port = parseInt(process.env.HENNOS_REDIS_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid HENNOS_REDIS_PORT value");
        }

        return { host, port };
    }

    static get OPENAI_API_ORG(): string {
        if (!process.env.OPENAI_API_ORG) {
            throw new Error("Missing OPENAI_API_ORG");
        }

        return process.env.OPENAI_API_ORG;
    }

    static get OPENAI_API_ORG_FREE(): string {
        if (!process.env.OPENAI_API_ORG_FREE) {
            throw new Error("Missing OPENAI_API_ORG_FREE");
        }

        return process.env.OPENAI_API_ORG_FREE;
    }

    static get OPENAI_API_KEY_FREE(): string {
        if (!process.env.OPENAI_API_KEY_FREE) {
            throw new Error("Missing OPENAI_API_KEY_FREE");
        }

        return process.env.OPENAI_API_KEY_FREE;
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

    static get OLLAMA_LLM(): string | false{
        if (!process.env.OLLAMA_LLM) {
            return false;
        }

        return process.env.OLLAMA_LLM;
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

    static get TELEGRAM_ID_WHITELIST(): number[] | false {
        if (!process.env.TELEGRAM_ID_WHITELIST) {
            return false;
        }
        const whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(",");
        return Array.from(new Set(whitelist)).map((entry) => parseInt(entry));
    }

    static get TELEGRAM_ID_BLACKLIST(): number[] | false {
        if (!process.env.TELEGRAM_ID_BLACKLIST) {
            return false;
        }
        const blacklist = process.env.TELEGRAM_ID_BLACKLIST.trim().split(",");
        return Array.from(new Set(blacklist)).map((entry) => parseInt(entry));
    }
}
