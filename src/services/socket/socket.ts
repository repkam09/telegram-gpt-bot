import { WebSocketServer, WebSocket } from "ws";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUser } from "../../singletons/user";

export class WSServerInstance {
    private static _ws: WebSocketServer;

    static async init(): Promise<void> {
        this._ws = new WebSocketServer({ port: Config.WS_SERVER_PORT });
        this._ws.on("connection", (ws) => {
            ws.on("error", console.error);
            ws.on("message", (data) => handleWebSocketMessage(ws, data));
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleWebSocketMessage(ws: WebSocket, data: any): Promise<void> {
    let parsed;
    try {
        parsed = JSON.parse(data);
    } catch (e) {
        ws.send(JSON.stringify({ error: "Invalid JSON" }));
        return;
    }

    if (!parsed.auth || parsed.auth !== Config.WS_SERVER_TOKEN) {
        ws.send(JSON.stringify({ error: "Unauthorized" }));
        return;
    }

    const user = await HennosUser.exists(parsed.chatId);
    if (!user) {
        ws.send(JSON.stringify({ error: "User not found" }));
        return;
    }

    Logger.trace(user, "Received a message from WebSocket client");
    if (parsed.__type === "completion") {
        const result = handlePrivateMessage(user, parsed.content);
        ws.send(JSON.stringify({
            __type: "completion",
            payload: result
        }));
        return;
    }

    if (parsed.__type === "context") {
        const context = await user.getChatContext();
        ws.send(JSON.stringify({
            __type: "context",
            payload: context
        }));
        return;
    }
}