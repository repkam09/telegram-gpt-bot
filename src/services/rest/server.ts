import { Config } from "../../singletons/config";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUser } from "../../singletons/consumer";

import Koa from "koa";
import KoaBodyParser from "koa-bodyparser";
import { HennosResponse } from "../../types";
import { handleEventMessage } from "../../handlers/text/event";
import { Logger } from "../../singletons/logger";

export class ServerRESTInterface {
    static async init(): Promise<void> {
        const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
        if (!user) {
            throw new Error("Existing admin user account not found");
        }

        // Create a basic Koa server with a single endpoint
        const koa = new Koa();
        koa.use(KoaBodyParser());

        koa.use(async (ctx) => {
            if (ctx.method === "POST" && ctx.path === "/message") {
                const { message } = ctx.request.body as { message: string };
                if (!message || typeof message !== "string") {
                    ctx.status = 400;
                    ctx.body = { error: "Invalid message" };
                    return;
                }

                const response = await handlePrivateMessage(user, message);
                return handleHennosResponse(ctx, response);
            }

            if (ctx.method === "POST" && ctx.path === "/event") {
                Logger.info(user, `Received event: ${JSON.stringify(ctx.request.body)}`);
                const event = `<webhook-event>${JSON.stringify(ctx.request.body)}</webhook-event>`;
                const response = await handleEventMessage(user, event);

                return handleHennosResponse(ctx, response);
            }

            ctx.status = 404;
            ctx.body = { error: "Not found" };
        });

        if (Config.WEBHOOK_ENABLED) {
            // Initialize webhook server
            koa.listen(Config.WEBHOOK_PORT, () => {
                console.log(`Webhook server listening on port ${Config.WEBHOOK_PORT}`);
            });
        }
    }
}

function handleHennosResponse(ctx: Koa.Context, response: HennosResponse) {
    if (response.__type === "string") {
        ctx.status = 200;
        ctx.body = { response: response.payload };
        return;
    }

    if (response.__type === "empty") {
        ctx.status = 200;
        ctx.body = { response: null };
        return;
    }

    ctx.status = 500;
    ctx.body = { error: "Internal Server Error" };
}
