/* eslint-disable @typescript-eslint/no-explicit-any */

import TelegramBot from "node-telegram-bot-api";
import { Config } from "./config";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";

export class Logger {
    static info(user: HennosUser | HennosGroup, message?: any, ...optionalParams: any[]): void {
        console.log(new Date().toISOString(), message, ...optionalParams);
    }

    static warn(user: HennosUser | HennosGroup, message?: any, ...optionalParams: any[]): void {
        console.warn(new Date().toISOString(), message, ...optionalParams);
    }

    static error(user: HennosUser | HennosGroup, message?: any, ...optionalParams: any[]): void {
        console.error(new Date().toISOString(), message, ...optionalParams);
    }

    static debug(message?: any, ...optionalParams: any[]): void {
        if (Config.HENNOS_VERBOSE_LOGGING) {
            console.log("DEBUG:", message, ...optionalParams);
        }
    }

    static trace(context: string, msg: TelegramBot.Message) {
        console.log(`${new Date().toISOString()}: first_name=${msg.from?.first_name}, last_name=${msg.from?.last_name}, username=${msg.from?.username}, userId=${msg.from?.id}, chatId=${msg.chat.id}, messageId=${msg.message_id}, context=${context}`);
    }
}