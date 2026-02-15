import express, { Express, Request, Response } from "express";
import path from "node:path";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { TelegramInstance } from "./telegram";
import { createWorkflowId as createAgentWorkflowId, queryAgenticWorkflowContext, signalAgenticWorkflowExit, signalAgenticWorkflowMessage } from "../temporal/agent/interface";
import { randomUUID } from "node:crypto";
import { HennosRealtime } from "../realtime/sip";
import { AgentResponseHandler } from "../response";
import { signalGemstoneWorkflowMessage, createWorkflowId as createGemstoneWorkflowId } from "../temporal/gemstone/interface";
export class WebhookInstance {
    static _instance: Express;
    static _streams: Map<string, { stream: Response, uuid: string }[]> = new Map();

    static register(sessionId: string, socketId: string, stream: Response) {
        if (!WebhookInstance._streams.has(sessionId)) {
            WebhookInstance._streams.set(sessionId, []);
        }
        WebhookInstance._streams.get(sessionId)?.push({ stream, uuid: socketId });
    }

    static unregister(sessionId: string, socketId: string) {
        const streams = WebhookInstance._streams.get(sessionId);
        if (streams) {
            WebhookInstance._streams.set(sessionId, streams.filter(s => s.uuid !== socketId));
        }
    }

    static sockets(sessionId: string) {
        return WebhookInstance._streams.get(sessionId) || [];
    }

    static instance(): Express {
        if (!WebhookInstance._instance) {
            const app = express();
            app.use(express.json());
            WebhookInstance._instance = app;
        }
        return WebhookInstance._instance;
    }

    static async init() {
        if (!Config.TELEGRAM_BOT_WEBHOOK_ENABLED) {
            return;
        }
        Logger.info(undefined, "Starting Hennos Webhook API");

        const app = WebhookInstance.instance();
        app.use(express.static(path.join(__dirname, "../../public")));

        app.get("/healthz", (req: Request, res: Response) => {
            return res.status(200).send("OK");
        });

        // Set up endpoints for each of the Temporal Workflow Signals
        app.get("/hennos/conversation/:sessionId", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createAgentWorkflowId("webhook", sessionId);
            // TODO: This really should read from the Database of actual messages
            //       the context is the (potentially compressed) working memory.
            // 
            //       This should also handle pagination for the user scrolling
            //       way back in the conversation, etc.
            const context = await queryAgenticWorkflowContext(workflowId);
            return res.status(200).json(context);
        });

        app.get("/:agent/conversation/:sessionId/stream", (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                return res.status(400).send("Invalid sessionId");
            }

            const agent = req.params.agent;
            if (!agent) {
                return res.status(400).send("Missing agent");
            }

            if (Array.isArray(agent)) {
                return res.status(400).send("Invalid agent");
            }

            const agents = ["hennos", "gemstone"];
            if (!agents.includes(agent)) {
                return res.status(400).send("Invalid agent");
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

            Logger.debug(undefined, `Client connected for ${agent} sessionId: ${sessionId}, socketId: ${socketId}`);
            WebhookInstance.register(sessionId, socketId, res);

            res.on("close", () => {
                Logger.debug(undefined, `Client disconnected for ${agent} sessionId: ${sessionId}, socketId: ${socketId}`);
                WebhookInstance.unregister(sessionId, socketId);
            });

            // Send initial comment to establish connection
            res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
        });

        app.post("/hennos/conversation/:sessionId/message", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createAgentWorkflowId("webhook", sessionId);

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
                await signalAgenticWorkflowMessage(workflowId, author, message);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error signaling agentic workflow message: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error sending message" });
            }

            return res.status(200).json({ status: "ok" });
        });

        app.post("/hennos/conversation/:sessionId/artifact", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createAgentWorkflowId("webhook", sessionId);

            const author = req.body.author;
            if (!author) {
                Logger.error(workflowId, "Missing author");
                return res.status(400).send("Missing author");
            }

            try {
                // TODO: Implement this.
                throw new Error("Not Implemented");
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error signaling agentic workflow message: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error handling artifact" });
            }
        });

        app.delete("/hennos/conversation/:sessionId", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createAgentWorkflowId("webhook", sessionId);

            if (Array.isArray(workflowId)) {
                Logger.error(undefined, "Invalid workflowId");
                return res.status(400).send("Invalid workflowId");
            }

            try {
                await signalAgenticWorkflowExit(workflowId);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error exiting agentic workflow: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error exiting workflow" });
            }

            return res.status(200).json({ status: "ok" });
        });

        app.post("/hennos/conversation/:sessionId/context", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createAgentWorkflowId("webhook", sessionId);

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
                await signalAgenticWorkflowMessage(workflowId, author, message);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error signaling agentic workflow message: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error updating context" });
            }

            return res.status(200).json({ status: "ok" });
        });

        app.post("/hennos/realtime/sip", async (req: Request, res: Response) => {
            if (!req.body) {
                Logger.error(undefined, "Missing request body");
                return res.status(400).send("Missing request body");
            }

            if (!req.body.type) {
                Logger.error(undefined, "Missing request type");
                return res.status(400).send("Missing request type");
            }

            if (req.body.type !== "realtime.call.incoming") {
                Logger.error(undefined, `Unsupported request type: ${req.body.type}`);
                return res.status(400).send(`Unsupported request type: ${req.body.type}`);
            }

            const callId = req.body.data?.call_id;
            if (!callId) {
                Logger.error(undefined, "Missing call_id");
                return res.status(400).send("Missing call_id");
            }

            // TODO: Some way of looking up the phone number to associate with a workflowId
            const workflowId = undefined;

            await HennosRealtime.createRealtimeSIPSession(workflowId, req.body);
            return res.status(200).json({ status: "ok" });
        });

        app.post("/gemstone/conversation/:sessionId/message", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createGemstoneWorkflowId("webhook", sessionId);

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
                await signalGemstoneWorkflowMessage(workflowId, author, message);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error signaling gemstone workflow message: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error sending message" });
            }

            return res.status(200).json({ status: "ok" });
        });

        if (Config.TELEGRAM_BOT_KEY) {
            // Set up endpoints for Telegram Webhook mode
            app.post(`/bot${Config.TELEGRAM_BOT_KEY}`, (req: Request, res: Response) => {
                const bot = TelegramInstance.instance();
                Logger.debug(undefined, `Telegram Webhook: ${JSON.stringify(req.body)}`);
                bot.processUpdate(req.body);
                return res.sendStatus(200);
            });

            app.get(`/bot${Config.TELEGRAM_BOT_KEY}`, (req: Request, res: Response) => {
                return res.status(200).send("OK");
            });
        }

        AgentResponseHandler.registerListener("webhook", async (message: string, chatId: string) => {
            Logger.info(undefined, `Received webhook message: ${message} for chatId: ${chatId}`);

            // Grab any listening response streams for this chatId
            const sockets = WebhookInstance.sockets(chatId);
            if (sockets) {
                Logger.debug(undefined, `Found ${sockets.length} active streams for chatId: ${chatId}`);
                for (const session of sockets) {
                    if (!session.stream.writableEnded) {
                        session.stream.write(`data: ${JSON.stringify({ role: "assistant", content: message })}\n\n`);
                    } else {
                        Logger.warn(undefined, `Stream ended for chatId: ${chatId}`);
                    }
                }
            } else {
                Logger.debug(undefined, `No active streams for chatId: ${chatId}`);
            }
        });

        app.listen(Config.TELEGRAM_BOT_WEBHOOK_PORT, () => {
            Logger.info(undefined, `Hennos Webhook API server is listening on ${Config.TELEGRAM_BOT_WEBHOOK_PORT}`);
        });
        return app;
    }
}