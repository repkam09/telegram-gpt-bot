
import { Context } from "koa";
import Router from "@koa/router";
import { getChatContext } from "../../handlers/text/common";

export function routes(router: Router) {
    router.get("/chat/:id", (ctx: Context) => {
        const { id } = ctx.params;

        const chatId = Number.parseInt(id);
        const context = getChatContext(chatId);
        ctx.body = {
            id,
            context,
            error: false
        };
    });
}