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
    router.post("/chat/:token", async (ctx: KoaContext, next: Koa.Next): Promise<void> => {
        const { message }: ChatRequestBody = ctx.request.body;
        const user = await HennosUser.byPairingToken(ctx.params.token);
        if (user && user.whitelisted) {
            const result = await handlePrivateMessage(user, message);
            const context = await user.getChatContext();
            ctx.body = {
                result,
                context,
                error: false
            };
        }
        return next();
    });
}
