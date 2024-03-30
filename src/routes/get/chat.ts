
import { Context } from "koa";
import Router from "@koa/router";
import { HennosUser } from "../../singletons/user";

export function routes(router: Router) {
    router.get("/chat/:id", async (ctx: Context): Promise<void> => {
        const { id } = ctx.params;

        const chatId = Number.parseInt(id);
        const user = await HennosUser.exists(chatId);
        if (user) {
            const context = await user.getChatContext();
            ctx.body = {
                id,
                context,
                error: false
            };
        }

        if (!user) {
            ctx.body = {
                error: true,
                message: "Invalid User Id"
            };
        }
    });
}