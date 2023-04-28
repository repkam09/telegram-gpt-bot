import * as dotenv from "dotenv";
dotenv.config();

import { Logger } from "./logger";

export class Config {
    static validate() {
        Logger.info(`OPENAI_API_ORG is configured as ${Config.OPENAI_API_ORG ? "[HIDDEN]" : "error"}`);
        Logger.info(`OPENAI_API_KEY is configured as ${Config.OPENAI_API_KEY ? "[HIDDEN]" : "error"}`);
        Logger.info(`OPENAI_API_LLM is configured as ${Config.OPENAI_API_LLM}`);

        Logger.info(`TELEGRAM_BOT_KEY is configured as ${Config.TELEGRAM_BOT_KEY ? "[HIDDEN]" : "error"}`);
        Logger.info(`TELEGRAM_GROUP_PREFIX is configured as ${Config.TELEGRAM_GROUP_PREFIX}`);

        Logger.info(`TELEGRAM_BOT_ADMIN is configured as ${Config.TELEGRAM_BOT_ADMIN}`);
        Logger.info(`TELEGRAM_ID_WHITELIST is configured as ${Config.TELEGRAM_ID_WHITELIST}`);
    }

    static get OPENAI_API_ORG(): string {
        if (!process.env.OPENAI_API_ORG) {
            throw new Error("Missing OPENAI_API_ORG");
        }

        return process.env.OPENAI_API_ORG;
    }

    static get OPENAI_API_KEY(): string {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        return process.env.OPENAI_API_KEY;
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

    static get OPENAI_API_LLM() {
        if (!process.env.OPENAI_API_LLM) {
            throw new Error("Missing OPENAI_API_LLM");
        }

        return process.env.OPENAI_API_LLM;
    }
}
