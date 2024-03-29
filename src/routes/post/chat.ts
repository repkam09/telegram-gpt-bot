import Koa, { Context } from "koa";
import Router from "@koa/router";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUser } from "../../singletons/user";

interface KoaContext extends Context {
    request: KoaRequest;
}

interface KoaRequest extends Koa.Request {
    body: ChatRequestBody;
}

interface ChatRequestBody {
    message: string;
}

export function routes(router: Router) {
    router.post("/chat/:id", async (ctx: KoaContext, next: Koa.Next): Promise<void> => {
        const { id } = ctx.params;
        const { message }: ChatRequestBody = ctx.request.body;

        const chatId = Number.parseInt(id);
        const user = await HennosUser.exists(chatId);
        if (!user || !user.whitelisted) {
            ctx.body = {
                error: true,
                message: "Invalid User Id"
            };
            return next();
        }

        const result = await handlePrivateMessage(user, message);

        ctx.body = {
            id,
            result,
            error: false
        };
    });
}
