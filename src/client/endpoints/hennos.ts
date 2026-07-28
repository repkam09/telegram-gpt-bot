import { Express } from "express";
import { HennosRealtime } from "../../realtime/sip";

export class HennosWebhookInstance {
    public static init(app: Express) {
        app.post("/hennos/realtime/sip", HennosRealtime.middleware());
    }
}