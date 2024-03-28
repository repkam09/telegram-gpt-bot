import TelegramBot from "node-telegram-bot-api";
import { Config } from "./config";
import { Logger } from "./logger";

export class BotInstance {
    static _instance: TelegramBot;

    static instance(): TelegramBot {
        if (!BotInstance._instance) {
            BotInstance._instance = new TelegramBot(Config.TELEGRAM_BOT_KEY, { polling: true });
            BotInstance._instance.on("message", (msg) => {
                Logger.trace("trace", msg);
            });
        }

        return BotInstance._instance;
    }
}