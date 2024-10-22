import Koa, { Context, Next } from "koa";
import Router from "@koa/router";
import BodyParser from "koa-bodyparser";
import { handlePrivateMessage } from "../handlers/text/private";
import { HennosUser } from "../singletons/user";
import { routes as chatPostRoutes } from "./post/chat";
import { routes as chatGetRoutes } from "./get/chat";
import { routes as rootGetRoutes } from "./get/root";

export function setupKoaRoutes(app: Koa) {
    const router = new Router({
        prefix: "/api/hennos"
    });

    app.use(BodyParser());
    app.use(async (ctx: Context, next: Next) => {
        console.log(`Request: ${ctx.method} ${ctx.url}`);
        return next();
    });

    rootGetRoutes(router);
    chatPostRoutes(router);
    chatGetRoutes(router);

    app.use(router.routes());
    app.use(router.allowedMethods());
}
