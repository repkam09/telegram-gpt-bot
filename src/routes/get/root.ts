
import { Context } from "koa";
import Router from "@koa/router";

export function routes(router: Router) {
    router.get("/", (ctx: Context) => {
        ctx.body = {
            status: "running",
            error: false
        };
    });
}