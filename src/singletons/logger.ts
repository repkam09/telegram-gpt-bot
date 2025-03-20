/* eslint-disable @typescript-eslint/no-explicit-any */

import { Config } from "./config";
import { HennosConsumer } from "./base";

export class Logger {
    static info(req: HennosConsumer | undefined, message?: any, ...optionalParams: any[]): void {
        if (req) {
            console.log(new Date().toISOString(), req.toString(), message, ...optionalParams);
        } else {
            console.log(new Date().toISOString(), message, ...optionalParams);
        }
    }

    static warn(req: HennosConsumer | undefined, message?: any, ...optionalParams: any[]): void {
        if (req) {
            console.warn(new Date().toISOString(), req.toString(), message, ...optionalParams);
        } else {
            console.warn(new Date().toISOString(), message, ...optionalParams);
        }
    }

    static error(req: HennosConsumer | undefined, message?: any, ...optionalParams: any[]): void {
        if (req) {
            console.error(new Date().toISOString(), req.toString(), message, ...optionalParams);
        } else {
            console.error(new Date().toISOString(), message, ...optionalParams);
        }
    }

    static debug(req: HennosConsumer | undefined, message?: any, ...optionalParams: any[]): void {
        if (Config.HENNOS_VERBOSE_LOGGING) {
            if (req) {
                console.log(new Date().toISOString(), "DEBUG:", req.toString(), message, ...optionalParams);
            } else {
                console.log(new Date().toISOString(), "DEBUG:", message, ...optionalParams);
            }
        }
    }

    static trace(user: HennosConsumer, context: string) {
        console.log(new Date().toISOString(), user.toString(), `context=${context}`);
    }
}