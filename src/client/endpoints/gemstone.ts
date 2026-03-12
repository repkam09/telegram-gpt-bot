import { Express, Request, Response } from "express";
import { Logger } from "../../singletons/logger";
import { randomUUID } from "node:crypto";
import { WebhookInstance } from "../api";
import { GemstoneMiddleware } from "../../temporal/gemstone/middleware";

export class GemstoneWebhookInstance {
    public static init(app: Express) {
        app.post("/gemstone/conversation/:sessionId/message", GemstoneMiddleware.postMessage());

        app.get("/gemstone/conversation/:sessionId/stream", (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                return res.status(400).send("Invalid sessionId");
            }

            // Socket tuning
            req.socket.setTimeout(0);
            req.socket.setNoDelay(true);
            req.socket.setKeepAlive(true);

            // Set up headers for the SSE Stream
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.flushHeaders(); // Send headers immediately to keep connection open

            const socketId = randomUUID();

            Logger.debug(undefined, `Client connected for Gemstone sessionId: ${sessionId}, socketId: ${socketId}`);
            WebhookInstance.register(sessionId, socketId, res);

            res.on("close", () => {
                Logger.debug(undefined, `Client disconnected for Gemstone sessionId: ${sessionId}, socketId: ${socketId}`);
                WebhookInstance.unregister(sessionId, socketId);
            });

            // Send initial comment to establish connection
            res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
        });

    }
}