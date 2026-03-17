import { Express, Request, Response } from "express";
import { createWorkflowId as createAgentWorkflowId, signalAgenticWorkflowExit, signalAgenticWorkflowMessage } from "../../temporal/agent/interface";
import { HennosRealtime } from "../../realtime/sip";
import { Database } from "../../database";
import { Logger } from "../../singletons/logger";
import { WebhookInstance } from "../api";
import { randomUUID } from "node:crypto";
import { workflowSessionMcpClient } from "../../singletons/mcp";

export class HennosWebhookInstance {
    public static init(app: Express) {
        app.post("/hennos/realtime/sip", HennosRealtime.middleware());
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

        app.get("/hennos/conversation/:sessionId/stream", (req: Request, res: Response) => {
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

            Logger.debug("HennosWebhook", `Client connected for Hennos sessionId: ${sessionId}, socketId: ${socketId}`);
            WebhookInstance.register(sessionId, socketId, res);

            res.on("close", () => {
                Logger.debug("HennosWebhook", `Client disconnected for Hennos sessionId: ${sessionId}, socketId: ${socketId}`);
                WebhookInstance.unregister(sessionId, socketId);
            });

            // Send initial comment to establish connection
            res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
        });

        app.post("/hennos/conversation/:sessionId/message", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
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
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const body = req.body;
            try {
                const client = await workflowSessionMcpClient(sessionId);
                await client.validate(body);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error("HennosWebhook", `Error validating MCP server: ${error.message}`);
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
                Logger.error("HennosWebhook", `Error adding MCP server: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error adding MCP server", details: error.message });
            }
        });

        app.get("/hennos/conversation/:sessionId/tools", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
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
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            // This endpoint is used for removing mcp-servers from this conversation

            throw new Error("Not Implemented");
        });

        app.post("/hennos/conversation/:sessionId/artifact", async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
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
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = await createAgentWorkflowId("webhook", sessionId);

            if (Array.isArray(workflowId)) {
                Logger.error("HennosWebhook", "Invalid workflowId");
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
                Logger.error("HennosWebhook", "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error("HennosWebhook", "Invalid sessionId");
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

    }
}