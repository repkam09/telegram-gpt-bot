
import { Context } from "koa";
import Router from "@koa/router";
import { getChatContext } from "../../handlers/text/common";

export function routes(router: Router) {
    router.get("/chat/:id", async (ctx: Context): Promise<void> => {
        const { id } = ctx.params;

        const chatId = Number.parseInt(id);
        const context = await getChatContext(chatId);
        ctx.body = {
            id,
            context,
            error: false
        };
    });
}