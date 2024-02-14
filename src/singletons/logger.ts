/* eslint-disable @typescript-eslint/no-explicit-any */

import TelegramBot from "node-telegram-bot-api";
import { Config } from "./config";

export class Logger {
    static info(message?: any, ...optionalParams: any[]): void {
        console.log(new Date().toISOString(), message, ...optionalParams);
    }

    static warn(message?: any, ...optionalParams: any[]): void {
        console.warn(new Date().toISOString(), message, ...optionalParams);
    }

    static error(message?: any, ...optionalParams: any[]): void {
        console.error(new Date().toISOString(), message, ...optionalParams);
    }

    static debug(message?: any, ...optionalParams: any[]): void {
        if (Config.HENNOS_VERBOSE_LOGGING) {
            console.log("DEBUG:", message, ...optionalParams);
        }
    }

    static trace(type: string, msg: TelegramBot.Message) {
        console.log(`${new Date().toISOString()}: first_name=${msg.from?.first_name}, last_name=${msg.from?.last_name}, username=${msg.from?.username}, userId=${msg.from?.id}, chatId=${msg.chat.id}, messageId=${msg.message_id}, type=${type}`);
    }
}