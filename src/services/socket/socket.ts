import { WebSocketServer, WebSocket } from "ws";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUser } from "../../singletons/user";
import { Database } from "../../singletons/sqlite";

export class WSServerInstance {
    private static _ws: WebSocketServer;

    static async init(): Promise<void> {
        this._ws = new WebSocketServer({ port: Config.WS_SERVER_PORT });
        this._ws.on("connection", (ws) => {
            Logger.debug(undefined, "WebSocket connection established");
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
        Logger.debug(undefined, "WebSocket request invalid JSON, ignoring");
        return;
    }

    if (!parsed.auth || !parsed.__type || !parsed.requestId || !parsed.hennosId) {
        Logger.debug(undefined, "WebSocket request missing required fields, ignoring");
        return;
    }

    if (parsed.auth !== Config.WS_SERVER_TOKEN) {
        Logger.debug(undefined, "WebSocket request invalid auth token");
        ws.send(JSON.stringify({ error: "Bad Request", requestId: parsed.requestId }));
        return;
    }

    const user = await HennosUser.fromHennosLink(parsed.hennosId);
    if (!user) {
        Logger.debug(undefined, "WebSocket request user not found");
        ws.send(JSON.stringify({ error: "Bad Request", requestId: parsed.requestId }));
        return;
    }

    if (parsed.__type === "users" && user.isAdmin()) {
        Logger.debug(user, `WebSocket whitelist request received: ${parsed.requestId}`);

        const db = await Database.instance();
        const users = await db.user.findMany({
            select: {
                chatId: true,
                username: true,
                firstName: true,
                lastName: true,
                whitelisted: true
            }
        });

        ws.send(JSON.stringify({
            __type: "users",
            requestId: parsed.requestId,
            payload: users.map((user) => {
                return {
                    chatId: Number(user.chatId),
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    whitelisted: user.whitelisted
                };
            })
        }));
        Logger.debug(undefined, "WebSocket users response sent");
        return;
    }

    Logger.trace(user, `websocket_${parsed.__type}`);

    if (parsed.__type === "completion") {
        Logger.debug(user, `WebSocket completion request received: ${parsed.requestId}`);
        const result = await handlePrivateMessage(user, parsed.content);
        ws.send(JSON.stringify({
            __type: "completion",
            requestId: parsed.requestId,
            payload: result
        }));
        Logger.debug(user, "WebSocket completion response sent");
        return;
    }

    if (parsed.__type === "context") {
        Logger.debug(user, `WebSocket context request received: ${parsed.requestId}`);
        const context = await user.getChatContext();
        ws.send(JSON.stringify({
            __type: "context",
            requestId: parsed.requestId,
            payload: context
        }));
        Logger.debug(user, "WebSocket context response sent");
        return;
    }

    Logger.debug(user, `WebSocket request type not supported: ${parsed.__type}`);
}