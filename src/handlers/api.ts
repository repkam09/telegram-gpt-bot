/* eslint-disable @typescript-eslint/no-non-null-assertion */
import TelegramBot from "node-telegram-bot-api";
import { Logger } from "../singletons/logger";
import Koa, { Context, Middleware, Next } from "koa";
import KoaBody from "koa-bodyparser";
import { getChatContext, processChatCompletion, updateChatContextWithName } from "./text/common";
import { isOnWhitelist } from "../utils";
import { Config } from "../singletons/config";
import { buildPrompt } from "./text/private";

export function listen() {
    if (Config.HENNOS_EXTERNAL_REQUEST_KEY) {
        const app = new Koa();
        app.use(ChatAuthorizationMiddleware());
        app.use(KoaBody());
        app.use(ContextMiddleware());
        app.use(ChatMiddleware());
        app.listen(Config.HENNOS_EXTERNAL_REQUEST_PORT, () => {
            Logger.info("Hennos External Request API Enabled");
        });
    } else {
        Logger.info("Hennos External Request API Disabled");

    }
}

function ChatAuthorizationMiddleware(): Middleware {
    return async function authorization(ctx: Context, next: Next) {
        if (!ctx.headers.authorization) {
            ctx.status = 401;
            ctx.body = { error: true, data: "Unauthorized" };
            return next();
        }

        if (ctx.headers.authorization !== Config.HENNOS_EXTERNAL_REQUEST_KEY) {
            ctx.status = 401;
            ctx.body = { error: true, data: "Unauthorized" };
            return next();
        }

        return next();
    };
}

function ContextMiddleware() {
    return async function context(ctx: Context, next: Next) {
        if (ctx.method !== "GET" || !ctx.query.id || Array.isArray(ctx.query.id)) {
            return next();
        }

        const chatId = parseInt(ctx.query.id);
        if (Number.isNaN(chatId)) {
            ctx.status = 400;
            ctx.body = "Bad Request";
            return next();
        }

        const result = await getChatContext(chatId);

        ctx.status = 200;
        ctx.body = { error: false, data: result };

        return next();
    };
}

function ChatMiddleware(): Middleware {
    return async function chat(ctx: Context, next: Next) {
        if (ctx.method !== "POST" || !ctx.request.body) {
            return next();
        }

        const body = ctx.request.body as { id: number, text: string, name: string };
        if (!body.id || !body.name || !body.text) {
            ctx.status = 400;
            ctx.body = "Bad Request";
            return next();
        }

        const msg = {
            chat: {
                id: body.id,
                type: "private"
            },
            from: {
                first_name: body.name,
                id: body.id
            },
            text: body.text
        } as TelegramBot.Message;

        if (!isOnWhitelist(msg.chat.id)) {
            ctx.status = 401;
            ctx.body = { error: true, data: "Unauthorized" };
            return next();
        }

        Logger.trace("text_api", msg);

        const prompt = buildPrompt(msg.from!.first_name);
        const context = await updateChatContextWithName(msg.chat.id, msg.from!.first_name, "user", msg.text!);
        const response = await processChatCompletion(msg.chat.id, [
            ...prompt,
            ...context
        ], {functions: false});

        const result = await updateChatContextWithName(msg.chat.id, "Hennos", "assistant", response.data as string);

        ctx.status = 200;
        ctx.body = { error: false, data: result };

        return next();
    };
}
