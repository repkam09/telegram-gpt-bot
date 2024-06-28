/* eslint-disable @typescript-eslint/no-explicit-any */

import { Config } from "./config";
import { HennosConsumer } from "./base";

export class Logger {
    static info(user: HennosConsumer, message?: any, ...optionalParams: any[]): void {
        console.log(new Date().toISOString(), user.toString(), message, ...optionalParams);
    }

    static warn(user: HennosConsumer, message?: any, ...optionalParams: any[]): void {
        console.warn(new Date().toISOString(), user.toString(), message, ...optionalParams);
    }

    static error(user: HennosConsumer, message?: any, ...optionalParams: any[]): void {
        console.error(new Date().toISOString(), user.toString(), message, ...optionalParams);
    }

    static debug(message?: any, ...optionalParams: any[]): void {
        if (Config.HENNOS_VERBOSE_LOGGING) {
            console.log(new Date().toISOString(), "DEBUG:", message, ...optionalParams);
        }
    }

    static trace(user: HennosConsumer, context: string) {
        console.log(new Date().toISOString(), user.toString(),  `context=${context}`);
    }
}