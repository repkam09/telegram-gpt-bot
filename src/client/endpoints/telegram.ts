import { Express, Request, Response } from "express";
import { Config } from "../../singletons/config";
import { TelegramInstance } from "../telegram";
import { Logger } from "../../singletons/logger";

export class TelegramWebhookInstance {
    public static init(app: Express) {
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
}