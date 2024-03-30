
import { Context, Next } from "koa";
import Router from "@koa/router";
import { HennosUser } from "../../singletons/user";

export function routes(router: Router) {
    router.get("/chat/:token", async (ctx: Context, next: Next): Promise<void> => {
        const user = await HennosUser.byPairingToken(ctx.params.token);
        if (user) {
            const context = await user.getChatContext();
            ctx.body = {
                context,
                error: false
            };
        }

        return next();
    });
}