import TelegramBot from "node-telegram-bot-api";
import { Logger } from "../singletons/logger";
import Koa, { Context, Middleware, Next } from "koa";
import Parser from "koa-bodyparser";
import { processChatCompletion, updateChatContext } from "./text/common";
import { isOnWhitelist } from "../utils";
import { Config } from "../singletons/config";
import { buildPrompt } from "./text/private";

export function listen() {
    if (Config.HENNOS_EXTERNAL_REQUEST_KEY) {
        const app = new Koa();
        app.use(Parser());
        app.use(ChatMiddleware());
        app.listen(Config.HENNOS_EXTERNAL_REQUEST_PORT, () => {
            Logger.info("Hennos External Request API Enabled");
        });
    } else {
        Logger.info("Hennos External Request API Disabled");

    }
}

function ChatMiddleware(): Middleware {
    return async function chat(ctx: Context, next: Next) {
        if (ctx.method !== "POST" || !ctx.request.body) {
            ctx.status = 400;
            ctx.body = { error: true, data: "Bad Request" };
            return next();
        }

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
        const context = await updateChatContext(msg.chat.id, "user", msg.text!);
        const response = await processChatCompletion(msg.chat.id, [
            ...prompt,
            ...context
        ]);

        await updateChatContext(msg.chat.id, "assistant", response);

        ctx.status = 200;
        ctx.body = { error: false, data: response };

        return next();
    };
}
