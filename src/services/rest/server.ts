import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/consumer";

import Koa from "koa";
import KoaBodyParser from "koa-bodyparser";
import KoaRouter from "@koa/router";
import { handleEventMessage } from "../../handlers/text/event";
import { Logger } from "../../singletons/logger";
import { handleHennosResponse } from "../telegram/telegram";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { SocketSessionHandler } from "../events/events";
import { createAdminUser, createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowExitSignal, agentWorkflowMessageSignal, createWorkflowId } from "../temporal/workflows";
import { WorkflowHandle } from "@temporalio/client";

export class ServerRESTInterface {
    static async init(): Promise<void> {
        const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
        if (!user) {
            throw new Error("Existing admin user account not found");
        }

        // Create a basic Koa server with a single endpoint
        const koa = new Koa();
        const router = new KoaRouter();

        koa.use(KoaBodyParser());

        router.get("/health", async (ctx, next) => {
            return returnOkay(ctx, next, { status: "OK" });
        });

        router.get("/event", async (ctx, next) => {
            Logger.info(user, `Received event: ${JSON.stringify(ctx.request.body)}`);
            const event = `<webhook-event>${JSON.stringify(ctx.request.body)}</webhook-event>`;
            const response = await handleEventMessage(user, event);

            ctx.status = 200;
            ctx.body = { response };
            await handleHennosResponse(user, response, {});
            return next();
        });

        router.post("/workflow/:workflowId/event", async (ctx, next) => {
            Logger.info(user, `Received workflow event for session ${ctx.params.workflowId}: ${JSON.stringify(ctx.request.body)}`);

            const client = await createTemporalClient();
            const workflowId = ctx.params.workflowId;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body = ctx.request.body as any;

            switch (body.type) {
                case "message": {
                    if (!body.query) {
                        return returnBadRequest(ctx, next, "Missing query in request body");
                    }
                    try {
                        const handle: WorkflowHandle<typeof agentWorkflow> = client.workflow.getHandle(workflowId);
                        await handle.signal(agentWorkflowMessageSignal, body.query, new Date().toISOString());
                    } catch (err: unknown) {
                        const error = err as Error;
                        console.error("Error sending signal to workflow:", error);
                        return returnBadRequest(ctx, next, error.message);
                    }
                    break;
                }

                case "end": {
                    try {
                        const handle: WorkflowHandle<typeof agentWorkflow> = client.workflow.getHandle(workflowId);
                        await handle.signal(agentWorkflowExitSignal);
                    } catch (err: unknown) {
                        const error = err as Error;
                        console.error("Error sending signal to workflow:", error);
                        return returnBadRequest(ctx, next, error.message);
                    }
                    break;
                }

                default: {
                    return returnBadRequest(ctx, next, `Unknown event type: ${body.type}`);
                }
            }

            return returnOkay(ctx, next, { status: "OK" });
        });

        router.post("/workflow", async (ctx, next) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { chatId, displayName } = ctx.request.body as any;
            if (!chatId || !displayName) {
                return returnBadRequest(ctx, next, "Missing chatId or displayName in request body");
            }

            const client = await createTemporalClient();
            const workflowId = createWorkflowId("server", { chatId });

            console.log(`Starting workflow with ID: ${workflowId}`);

            try {
                await client.workflow.start(agentWorkflow, {
                    taskQueue: Config.TEMPORAL_TASK_QUEUE,
                    workflowId: workflowId,
                    args: [{
                        user: createAdminUser(`${user.chatId}`, user.displayName),
                        aggressiveContinueAsNew: false,
                    }]
                });
            } catch {
                // already running, probably
                console.log(`Workflow with ID: ${workflowId} is already running`);
            }

            try {
                const handle: WorkflowHandle<typeof agentWorkflow> = client.workflow.getHandle(workflowId);
                await handle.describe();
                return returnOkay(ctx, next, { workflowId });
            } catch {
                // not running, probably
                console.log(`Workflow with ID: ${workflowId} is not running`);
            }

            console.log(`Workflow with ID: ${workflowId} not found`);
            return returnNotFound(ctx, next, { workflowId });
        });

        router.get("/workflow/:workflowId/events", async (ctx, next) => {
            ctx.request.socket.setTimeout(0);
            ctx.req.socket.setNoDelay(true);
            ctx.req.socket.setKeepAlive(true);

            ctx.set({
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });

            const stream = new PassThrough();
            const socketId = randomUUID();

            Logger.info(`WorkflowId ${ctx.params.workflowId} Connected (socket: ${socketId})`);
            SocketSessionHandler.register(ctx.params.workflowId, socketId, stream);

            stream.on("error", (err) => {
                Logger.error(`WorkflowId ${ctx.params.workflowId} Error: ${err}`);
                SocketSessionHandler.unregister(ctx.params.workflowId, socketId);
            });

            stream.on("close", () => {
                Logger.info(`WorkflowId ${ctx.params.workflowId} Disconnected`);
                SocketSessionHandler.unregister(ctx.params.workflowId, socketId);
            });


            return returnOkay(ctx, next, stream);
        });


        koa.use(router.routes());
        koa.use(router.allowedMethods());

        if (Config.WEBHOOK_ENABLED) {
            // Initialize webhook server
            koa.listen(Config.WEBHOOK_PORT, () => {
                console.log(`Webhook server listening on port ${Config.WEBHOOK_PORT}`);
            });
        }
    }
}

function returnBadRequest(ctx: Koa.Context, next: Koa.Next, message: string): Promise<void> {
    ctx.status = 400;
    ctx.body = { error: message };

    return next();
}

function returnOkay(ctx: Koa.Context, next: Koa.Next, data: unknown): Promise<void> {
    ctx.status = 200;
    ctx.body = data;

    return next();
}

function returnNotFound(ctx: Koa.Context, next: Koa.Next, data: unknown): Promise<void> {
    ctx.status = 404;
    ctx.body = data;

    return next();
}