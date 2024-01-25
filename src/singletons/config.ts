import * as dotenv from "dotenv";
dotenv.config();

import { Logger } from "./logger";
import { ChatMemory } from "./memory";

export class Config {
    private static _TELEGRAM_ID_WHITELIST: number[] | false = false;
    private static _TELEGRAM_ID_BLACKLIST: number[] | false = false;

    static validate() {
        Logger.info(`OPENAI_API_ORG is configured as ${Config.OPENAI_API_ORG ? "[HIDDEN]" : "error"}`);
        Logger.info(`OPENAI_API_KEY is configured as ${Config.OPENAI_API_KEY ? "[HIDDEN]" : "error"}`);

        Logger.info(`OPENAI_API_LLM is configured as ${Config.OPENAI_API_LLM}`);
        Logger.info(`OLLAMA_LLM is configured as ${Config.OLLAMA_LLM}`);

        Logger.info(`TELEGRAM_BOT_KEY is configured as ${Config.TELEGRAM_BOT_KEY ? "[HIDDEN]" : "error"}`);
        Logger.info(`TELEGRAM_GROUP_PREFIX is configured as ${Config.TELEGRAM_GROUP_PREFIX}`);
        Logger.info(`TELEGRAM_BOT_ADMIN is configured as ${Config.TELEGRAM_BOT_ADMIN}`);

        Logger.info(`HENNOS_MAX_MESSAGE_MEMORY is configured as ${JSON.stringify(Config.HENNOS_MAX_MESSAGE_MEMORY)}`);
        Logger.info(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
        Logger.info(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

        Logger.info(`USE_PERSISTANT_CACHE is configured as ${JSON.stringify(Config.USE_PERSISTANT_CACHE)}`);
    }

    static async update_whitelist(whitelist: number[]) {
        const redis_whitelist = await ChatMemory.getSystemValue<number[]>("whitelist") ?? [];
        const new_whitelist = Array.from(new Set([...whitelist, ...redis_whitelist]));
        await ChatMemory.storeSystemValue("whitelist", new_whitelist);
        Config._TELEGRAM_ID_WHITELIST = new_whitelist;
    }

    static async update_blacklist(blacklist: number[]) {
        const redis_blacklist = await ChatMemory.getSystemValue<number[]>("blacklist") ?? [];
        const new_blacklist = Array.from(new Set([...blacklist, ...redis_blacklist]));
        await ChatMemory.storeSystemValue("blacklist", new_blacklist);
        Config._TELEGRAM_ID_BLACKLIST = new_blacklist;
    }

    static async sync() {
        Logger.info("Starting Configuration Sync");
        if (process.env.TELEGRAM_ID_WHITELIST) {
            const whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(",").map((entry) => parseInt(entry));
            await Config.update_whitelist(whitelist);
        } else {
            return Config._TELEGRAM_ID_WHITELIST = false;
        }
        Logger.info(`TELEGRAM_ID_WHITELIST is configured as ${Config.TELEGRAM_ID_WHITELIST}`);

        if (process.env.TELEGRAM_ID_BLACKLIST) {
            const blacklist = process.env.TELEGRAM_ID_BLACKLIST.trim().split(",").map((entry) => parseInt(entry));
            await Config.update_blacklist(blacklist);
        } else {
            return Config._TELEGRAM_ID_BLACKLIST = false;
        }
        Logger.info(`TELEGRAM_ID_BLACKLIST is configured as ${Config.TELEGRAM_ID_BLACKLIST}`);

        Logger.info("Finished Configuration Sync");
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

    static get OLLAMA_LLM(): string | false {
        if (!process.env.OLLAMA_LLM) {
            return false;
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

    static get TELEGRAM_ID_WHITELIST(): number[] | false {
        return Config._TELEGRAM_ID_WHITELIST;
    }

    static get TELEGRAM_ID_BLACKLIST(): number[] | false {
        return Config._TELEGRAM_ID_BLACKLIST;
    }

    static get CRYPTO_IV(): Buffer {
        if (!process.env.CRYPTO_IV) {
            throw new Error("Missing CRYPTO_IV");
        }

        const buffer = Buffer.from(process.env.CRYPTO_IV, "utf8");
        const iv = Buffer.alloc(16, 0);
        buffer.copy(iv, 0, 0, 16);

        return iv;
    }

    static get CRYPTO_ALGO(): string {
        if (!process.env.CRYPTO_ALGO) {
            return "aes-256-cbc";
        }

        return process.env.CRYPTO_ALGO;
    }
}
