// @ts-check

import TelegramBot from "node-telegram-bot-api";
import { Config } from "./config";

export class BotInstance {
    static _instance;

    static instance() {
        if (!BotInstance._instance) {
            BotInstance._instance = new TelegramBot(Config.TELEGRAM_BOT_KEY, { polling: true });
        }

        return BotInstance._instance;
    }
}