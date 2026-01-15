/* eslint-disable @typescript-eslint/no-explicit-any */

import pino from "pino";
import { Config } from "./config";
import { randomUUID } from "node:crypto";

export class Logger {

    private static instance: string = randomUUID();

    public static get logger() {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            if (Config.AXIOM_API_KEY && Config.AXIOM_DATASET) {
                return pino(
                    {
                        level: Config.HENNOS_VERBOSE_LOGGING ? "debug" : "info",
                        transport: {
                            target: "@axiomhq/pino",
                            options: {
                                dataset: Config.AXIOM_DATASET,
                                token: Config.AXIOM_API_KEY,
                            },
                        }
                    },
                );
            }
        }


        // Fallback to console logging
        return pino({
            level: Config.HENNOS_VERBOSE_LOGGING ? "debug" : "info",
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    singleLine: false,
                    ignore: "pid,hostname,instance,consumer",
                    errorLikeObjectKeys: ["err", "error", "cause", "reason"],
                    sync: true
                },
            },
        });
    }

    static info(req: { toString: () => string } | undefined, message?: string): void {
        if (req) {
            Logger.logger.info({
                consumer: req.toString(),
                instance: Logger.instance,
            }, message);
        } else {
            Logger.logger.info({
                consumer: null,
                instance: Logger.instance,
            }, message);
        }
    }

    static warn(req: { toString: () => string } | undefined, message?: string): void {
        if (req) {
            Logger.logger.warn({
                consumer: req.toString(),
                instance: Logger.instance,
            }, message);
        } else {
            Logger.logger.warn({
                consumer: null,
                instance: Logger.instance,
            }, message);
        }
    }

    static error(req: { toString: () => string } | undefined, message?: string, error?: Error): void {
        if (req) {
            Logger.logger.error({
                consumer: req.toString(),
                instance: Logger.instance,
                message: error ? error.message : undefined,
                stack: error ? error.stack : undefined,
            }, message);
        } else {
            Logger.logger.error({
                consumer: null,
                instance: Logger.instance,
                message: error ? error.message : undefined,
                stack: error ? error.stack : undefined,
            }, message);
        }
    }

    static debug(req: { toString: () => string } | undefined, message?: string): void {
        if (Config.HENNOS_VERBOSE_LOGGING) {
            if (req) {
                Logger.logger.debug({
                    consumer: req.toString(),
                    instance: Logger.instance,
                }, message);
            } else {
                Logger.logger.debug({
                    consumer: null,
                    instance: Logger.instance,
                }, message);
            }
        }
    }

    static trace(user: { toString: () => string }, context: string) {
        Logger.logger.trace({
            consumer: user.toString(),
            context: context,
            instance: Logger.instance,
        });
    }
}
