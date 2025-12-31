import express, { Express, Request, Response } from "express";
import { Config } from "./config";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { Logger } from "./logger";

export class WebhookSingleton {

    static _instance: Express;

    static instance(): Express {
        if (!WebhookSingleton._instance) {
            const app = express();
            app.use(express.json());
            WebhookSingleton._instance = app;
        }
        return WebhookSingleton._instance;
    }


    static async init() {
        Logger.info(undefined, "Starting Telegram Webhook Endpoints - Start");

        const app = WebhookSingleton.instance();
        app.get("/healthz", (req: Request, res: Response) => {
            res.status(200).send("OK");
        });

        app.post(`/bot${Config.TELEGRAM_BOT_KEY}`, (req: Request, res: Response) => {
            const bot = TelegramBotInstance.instance();
            Logger.debug(undefined, `Telegram Webhook: ${JSON.stringify(req.body)}`);
            bot.processUpdate(req.body);
            res.sendStatus(200);
        });

        app.get(`/bot${Config.TELEGRAM_BOT_KEY}`, (req: Request, res: Response) => {
            res.status(200).send("OK");
        });

        app.listen(Config.TELEGRAM_BOT_WEBHOOK_PORT, () => {
            Logger.info(undefined, `Express server is listening on ${Config.TELEGRAM_BOT_WEBHOOK_PORT}`);
        });

        Logger.info(undefined, "Starting Telegram Webhook Endpoints - Done");
        return app;
    }

}