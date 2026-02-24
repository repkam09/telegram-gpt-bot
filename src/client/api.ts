import express, { Express, Request, Response } from "express";
import path from "node:path";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { TelegramInstance } from "./telegram";
import { createWorkflowId as createAgentWorkflowId, signalAgenticWorkflowExit, signalAgenticWorkflowMessage } from "../temporal/agent/interface";
import { randomUUID } from "node:crypto";
import { HennosRealtime } from "../realtime/sip";
import { AgentResponseHandler } from "../response";
import { signalGemstoneWorkflowMessage, createWorkflowId as createGemstoneWorkflowId } from "../temporal/gemstone/interface";
import { signalLegacyWorkflowMessage, createWorkflowId as createLegacyWorkflowId } from "../temporal/legacy/interface";
import { Database } from "../database";
import { workflowSessionMcpClient } from "../singletons/mcp";

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

            const workflowId = await createAgentWorkflowId("webhook", sessionId);

            const db = Database.instance();
            const history = await db.workflowMessage.findMany({
                where: {
                    workflowId
                },
                select: {
                    content: true,
                    role: true,
                    userId: true,
                    datetime: true
                },
                orderBy: {
                    datetime: "asc"
                },
                take: 250
            });

            const respnse = history.map((entry) => ({
                content: entry.content,
                role: entry.role,
                user: entry.userId,
                date: entry.datetime
            }));

            return res.status(200).json(respnse);
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

            const agents = ["hennos", "gemstone", "legacy"];
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

            const workflowId = await createAgentWorkflowId("webhook", sessionId);

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

        app.post("/hennos/conversation/:sessionId/tools", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const body = req.body;
            try {
                const client = await workflowSessionMcpClient(sessionId);
                await client.validate(body);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(undefined, `Error validating MCP server: ${error.message}`);
                return res.status(400).json({ status: "error", message: "error validating MCP server", details: error.message });
            }

            // This endpoint is used for adding mcp-servers to this conversation
            const db = Database.instance();

            try {
                await db.workflowSession.upsert({
                    where: {
                        id: sessionId as string
                    },
                    create: {
                        activePlatform: "webhook",
                        id: sessionId as string,
                        mcpservers: {
                            create: {
                                name: body.name,
                                url: body.url,
                                transport: body.transport,
                                mcpserverHeaders: {
                                    create: body.headers.map((h: { key: string; value: string }) => ({
                                        key: h.key,
                                        value: h.value
                                    }))
                                }
                            }
                        }
                    },
                    update: {
                        activePlatform: "webhook",
                        mcpservers: {
                            create: {
                                name: body.name,
                                url: body.url,
                                transport: body.transport,
                                mcpserverHeaders: {
                                    create: body.headers.map((h: { key: string; value: string }) => ({
                                        key: h.key,
                                        value: h.value
                                    }))
                                }
                            }
                        }
                    }
                });

                return res.status(200).json({ status: "ok" });
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(undefined, `Error adding MCP server: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error adding MCP server", details: error.message });
            }
        });

        app.get("/hennos/conversation/:sessionId/tools", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            // This endpoint is used for listing the mcp-servers associated with this conversation
            const db = Database.instance();
            const servers = await db.modelContextProtocolServer.findMany({
                where: {
                    workflowSessionId: sessionId
                },
                select: {
                    id: true,
                    name: true,
                    transport: true,
                    url: true,
                    createdAt: true,
                    mcpserverHeaders: {
                        select: {
                            key: true,
                            value: true
                        }
                    }
                }
            });

            return res.status(200).json({ mcp: servers });
        });

        app.delete("/hennos/conversation/:sessionId/tools/:toolId", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            // This endpoint is used for removing mcp-servers from this conversation
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

            const workflowId = await createAgentWorkflowId("webhook", sessionId);

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

            const workflowId = await createAgentWorkflowId("webhook", sessionId);

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

            const workflowId = await createAgentWorkflowId("webhook", sessionId);

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

        app.post("/legacy/conversation/:sessionId/message", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
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

        if (Config.HENNOS_TELEGRAM_ENABLED) {
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

        app.listen(Config.HENNOS_API_PORT, () => {
            Logger.info(undefined, `Hennos Webhook API server is listening on ${Config.HENNOS_API_PORT}`);
        });

        return app;
    }
}