import express, { Express, Request, Response } from "express";
import path from "node:path";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { AgentResponseHandler } from "../response";
import { TelegramWebhookInstance } from "./endpoints/telegram";
import { HennosWebhookInstance } from "./endpoints/hennos";
import { MCPWebhookInstance } from "./endpoints/mcp";
import { A2AWebhookInstance } from "./endpoints/a2a";
import { GemstoneWebhookInstance } from "./endpoints/gemstone";
import { SupabaseWebhookInstance } from "./endpoints/supabase";
import { LegacyWebhookInstance } from "./endpoints/legacy";

export class WebhookInstance {
    static _instance: Express;
    static _streams: Map<string, { stream: Response, uuid: string }[]> = new Map();

    static register(sessionId: string, socketId: string, stream: Response) {
        if (!WebhookInstance._streams.has(sessionId)) {
            WebhookInstance._streams.set(sessionId, []);
        }

        Logger.debug(undefined, `Registering stream for sessionId: ${sessionId}, socketId: ${socketId}`);
        WebhookInstance._streams.get(sessionId)?.push({ stream, uuid: socketId });
    }

    static unregister(sessionId: string, socketId: string) {
        const streams = WebhookInstance._streams.get(sessionId);
        if (streams) {
            Logger.debug(undefined, `Unregistering stream for sessionId: ${sessionId}, socketId: ${socketId}`);
            WebhookInstance._streams.set(sessionId, streams.filter(s => s.uuid !== socketId));
        }
    }

    static sockets(sessionId: string) {
        Logger.debug(undefined, `Fetching sockets for sessionId: ${sessionId}`);
        return WebhookInstance._streams.get(sessionId) || [];
    }

    static instance(): Express {
        if (!WebhookInstance._instance) {
            Logger.info(undefined, "Creating new Express instance for Webhook API");
            const app = express();
            app.use(express.json());
            WebhookInstance._instance = app;
        }
        return WebhookInstance._instance;
    }

    static async init() {
        Logger.info(undefined, "Starting Hennos Webhook API");

        if (!Config.HENNOS_API_ENABLED) {
            Logger.info(undefined, "Hennos Webhook API is disabled. Skipping initialization.");
            return;
        }

        const app = WebhookInstance.instance();

        if (Config.HENNOS_DEVELOPMENT_MODE) {
            Logger.info(undefined, "Hennos Webhook API running in development mode. Serving static files from /public.");
            app.use(express.static(path.join(__dirname, "../../public")));
        }

        app.get("/healthz", (req: Request, res: Response) => {
            return res.status(200).send("OK");
        });

        if (Config.HENNOS_TELEGRAM_ENABLED) {
            TelegramWebhookInstance.init(app);
        }

        if (Config.HENNOS_MCP_ENABLED) {
            MCPWebhookInstance.init(app);
        }

        if (Config.HENNOS_A2A_ENABLED) {
            A2AWebhookInstance.init(app);
        }

        if (Config.HENNOS_GEMSTONE_ENABLED) {
            GemstoneWebhookInstance.init(app);
        }

        if (Config.HENNOS_SUPABASE_ENABLED) {
            SupabaseWebhookInstance.init(app);
        }

        // Enable the primary endpoints always
        HennosWebhookInstance.init(app);
        LegacyWebhookInstance.init(app);

        AgentResponseHandler.registerMessageListener("webhook", async (message: string, sessionId: string) => {
            Logger.info("webhook", `Received webhook message: ${message} for sessionId: ${sessionId}`);

            // Grab any listening response streams for this sessionId and send the message to them
            const sockets = WebhookInstance.sockets(sessionId);
            if (sockets) {
                Logger.debug("webhook", `Found ${sockets.length} active streams for sessionId: ${sessionId}`);
                for (const session of sockets) {
                    if (!session.stream.writableEnded) {
                        session.stream.write(`data: ${JSON.stringify({ role: "assistant", content: message })}\n\n`);
                    } else {
                        Logger.warn("webhook", `Stream ended for sessionId: ${sessionId}`);
                    }
                }
            } else {
                Logger.debug("webhook", `No active streams for sessionId: ${sessionId}`);
            }
        });

        AgentResponseHandler.registerArtifactListener("webhook", async (filePath: string, sessionId: string, mime_type: string, description?: string | undefined) => {
            Logger.info("webhook", `Received webhook artifact: ${filePath} for sessionId: ${sessionId} with mime_type: ${mime_type} and description: ${description}`);

            // Grab any listening response streams for this sessionId and send the message to them
            const sockets = WebhookInstance.sockets(sessionId);
            if (sockets) {
                Logger.debug("webhook", `Found ${sockets.length} active streams for sessionId: ${sessionId}`);
                // TODO: Handle sending artifact streams if needed
            } else {
                Logger.debug("webhook", `No active streams for sessionId: ${sessionId}`);
            }
        });

        AgentResponseHandler.registerStatusListener("webhook", async (event: { type: string; payload?: unknown }, sessionId: string) => {
            Logger.info("webhook", `Received status update: ${JSON.stringify(event)} for sessionId: ${sessionId}`);

            // Grab any listening response streams for this sessionId and send the message to them
            const sockets = WebhookInstance.sockets(sessionId);
            if (sockets) {
                Logger.debug("webhook", `Found ${sockets.length} active streams for sessionId: ${sessionId}`);
                // TODO: Handle sending status updates if needed
            } else {
                Logger.debug("webhook", `No active streams for sessionId: ${sessionId}`);
            }

        });


        Logger.info("webhook", "Hennos Webhook API initialized");
        app.listen(Config.HENNOS_API_PORT, () => {
            Logger.info("webhook", `Hennos Webhook API server is listening on ${Config.HENNOS_API_PORT}`);
        });

        return app;
    }
}