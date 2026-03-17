import { Express, Request, Response } from "express";
import { Logger } from "../../singletons/logger";
import { WebhookInstance } from "../api";
import { randomUUID } from "node:crypto";
import { signalLegacyWorkflowMessage, createWorkflowId as createLegacyWorkflowId } from "../../temporal/legacy/interface";

export class LegacyWebhookInstance {
    public static init(app: Express) {
        app.get("/legacy/conversation/:sessionId/stream", (req: Request, res: Response) => {
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

            Logger.debug("LegacyWebhook", `Client connected for Legacy sessionId: ${sessionId}, socketId: ${socketId}`);
            WebhookInstance.register(sessionId, socketId, res);

            res.on("close", () => {
                Logger.debug("LegacyWebhook", `Client disconnected for Legacy sessionId: ${sessionId}, socketId: ${socketId}`);
                WebhookInstance.unregister(sessionId, socketId);
            });

            // Send initial comment to establish connection
            res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
        });

        app.post("/legacy/conversation/:sessionId/message", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error("LegacyWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("LegacyWebhook", "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createLegacyWorkflowId("webhook", sessionId);

            const message = req.body.message;
            if (!message) {
                Logger.error(workflowId, "Missing message");
                return res.status(400).send("Missing message");
            }

            const author = req.body.author;
            if (!author) {
                Logger.error(workflowId, "Missing author");
                return res.status(400).send("Missing author");
            }

            try {
                await signalLegacyWorkflowMessage(workflowId, author, message);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error signaling legacy workflow message: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error sending message" });
            }

            return res.status(200).json({ status: "ok" });
        });
    }
}