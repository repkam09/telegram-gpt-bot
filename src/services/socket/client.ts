/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket from "ws";
import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/user";
import { Logger } from "../../singletons/logger";

export class WebSocketTestClient {
    static async run(): Promise<void> {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            throw new Error("WebSocket Client should not be used in production mode.");
        }

        const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
        if (!user) {
            throw new Error("Existing admin user account not found");
        }

        const ws = new WebSocket("ws://localhost:" + Config.WS_SERVER_PORT);
        ws.on("error", console.error);

        ws.on("open", function open() {
            ws.send(JSON.stringify({ auth: Config.WS_SERVER_TOKEN, chatId: Config.TELEGRAM_BOT_ADMIN, __type: "context" }));
        });

        ws.on("message", (data: any) => {
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                ws.send(JSON.stringify({ error: "Invalid JSON" }));
                return;
            }

            Logger.debug(undefined, "Received a message from WebSocket server", parsed);
        });
    }
}