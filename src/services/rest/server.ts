import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/consumer";

import Koa from "koa";
import KoaBodyParser from "koa-bodyparser";
import { handleEventMessage } from "../../handlers/text/event";
import { Logger } from "../../singletons/logger";
import { handleHennosResponse } from "../telegram/telegram";

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
            if (ctx.method === "POST" && ctx.path === "/event") {
                Logger.info(user, `Received event: ${JSON.stringify(ctx.request.body)}`);
                const event = `<webhook-event>${JSON.stringify(ctx.request.body)}</webhook-event>`;
                const response = await handleEventMessage(user, event);

                ctx.status = 200;
                ctx.body = { response };
                return handleHennosResponse(user, response, {});
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