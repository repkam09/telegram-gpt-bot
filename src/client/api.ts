import express, { Express, Request, Response } from "express";
import path from "node:path";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { HennosRealtime } from "../realtime/sip";
import { TelegramInstance } from "./telegram";

export class WebhookInstance {
    static _instance: Express;
    static _streams: Map<string, { stream: Response, uuid: string }[]> = new Map();

    static register(sessionId: string, socketId: string, stream: Response) {
        if (!WebhookInstance._streams.has(sessionId)) {
            WebhookInstance._streams.set(sessionId, []);
        }

        Logger.debug("WebhookInstance", `Registering stream for sessionId: ${sessionId}, socketId: ${socketId}`);
        WebhookInstance._streams.get(sessionId)?.push({ stream, uuid: socketId });
    }

    static unregister(sessionId: string, socketId: string) {
        const streams = WebhookInstance._streams.get(sessionId);
        if (streams) {
            Logger.debug("WebhookInstance", `Unregistering stream for sessionId: ${sessionId}, socketId: ${socketId}`);
            WebhookInstance._streams.set(sessionId, streams.filter(s => s.uuid !== socketId));
        }
    }

    static sockets(sessionId: string) {
        Logger.debug("WebhookInstance", `Fetching sockets for sessionId: ${sessionId}`);
        return WebhookInstance._streams.get(sessionId) || [];
    }

    static instance(): Express {
        if (!WebhookInstance._instance) {
            Logger.info("WebhookInstance", "Creating new Express instance for Webhook API");
            const app = express();
            app.use(express.json());
            WebhookInstance._instance = app;
        }
        return WebhookInstance._instance;
    }

    static async init() {
        Logger.info("WebhookInstance", "Starting Hennos Webhook API");

        if (!Config.HENNOS_API_ENABLED) {
            Logger.info("WebhookInstance", "Hennos Webhook API is disabled. Skipping initialization.");
            return;
        }

        const app = WebhookInstance.instance();

        if (Config.HENNOS_DEVELOPMENT_MODE) {
            Logger.info("WebhookInstance", "Hennos Webhook API running in development mode. Serving static files from /public.");
            app.use(express.static(path.join(__dirname, "../../public")));
        }

        app.get("/healthz", (req: Request, res: Response) => {
            return res.status(200).send("OK");
        });

        app.post("/hennos/realtime/sip", HennosRealtime.middleware());

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

        Logger.info("webhook", "Hennos Webhook API initialized");
        app.listen(Config.HENNOS_API_PORT, () => {
            Logger.info("webhook", `Hennos Webhook API server is listening on ${Config.HENNOS_API_PORT}`);
        });

        return app;
    }
}