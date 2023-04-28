import * as dotenv from "dotenv";
dotenv.config();

import { Logger } from "./logger";


export class Config {
    static validate() {
        if (!Config.OPENAI_API_ORG) {
            throw new Error("Missing OPENAI_API_ORG");
        }

        if (!Config.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        if (!Config.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        if (!Config.TELEGRAM_GROUP_PREFIX) {
            throw new Error("Missing TELEGRAM_GROUP_PREFIX");
        }

        if (!Config.OPENAI_API_LLM) {
            throw new Error("Missing OPENAI_API_LLM");
        }

        if (Config.TELEGRAM_ID_WHITELIST) {
            Logger.info("Whitelist Enabled: " + Config.TELEGRAM_ID_WHITELIST);
        }

        if (Config.TELEGRAM_BOT_ADMIN) {
            Logger.info("Bot Admin: " + Config.TELEGRAM_BOT_ADMIN);
        }
    }

    static get OPENAI_API_ORG() {
        return process.env.OPENAI_API_ORG || "unknown";
    }

    static get OPENAI_API_KEY() {
        return process.env.OPENAI_API_KEY || "unknown";
    }

    static get TELEGRAM_BOT_KEY() {
        return process.env.TELEGRAM_BOT_KEY || "unknown";
    }

    static get TELEGRAM_GROUP_PREFIX() {
        return process.env.TELEGRAM_GROUP_PREFIX + " ";
    }

    static get TELEGRAM_BOT_ADMIN() {
        return process.env.TELEGRAM_BOT_ADMIN || "unknown";
    }

    static get TELEGRAM_ID_WHITELIST() {
        return process.env.TELEGRAM_ID_WHITELIST || "unknown";
    }

    static get OPENAI_API_LLM() {
        return process.env.OPENAI_API_LLM || "unknown";
    }
}
