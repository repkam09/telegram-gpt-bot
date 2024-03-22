import Koa, { Context, Next } from "koa";
import Router from "@koa/router";
import BodyParser from "koa-bodyparser";

import { routes as chatPostRoutes } from "./routes/post/chat";
import { routes as chatGetRoutes } from "./routes/get/chat";
import { routes as rootGetRoutes } from "./routes/get/root";

export function init() {
    const app = new Koa();
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
    app.listen(3000);

    console.log("Server running on port 3000");

    return app;
}