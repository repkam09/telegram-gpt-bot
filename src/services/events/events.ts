import { PassThrough } from "node:stream";
import { Logger } from "../../singletons/logger";
import { parseWorkflowId } from "../temporal/workflows";

type SocketSession = {
    workflowId: string;
    socketId: string;
    socket: PassThrough;
};

type BroadcastType = "message" | "usage";

export class SocketSessionHandler {
    private static sessions: Map<string, SocketSession[]> = new Map();
    private static handlers: Map<string, (workflow: object, type: BroadcastType, message: string) => void> = new Map();

    public static register(
        workflowId: string,
        socketId: string,
        socket: PassThrough
    ): void {
        if (!SocketSessionHandler.sessions.has(workflowId)) {
            SocketSessionHandler.sessions.set(workflowId, []);
        }

        const session = SocketSessionHandler.sessions.get(workflowId);
        if (!session) {
            throw new Error(`Session map not found for user ${workflowId}`);
        }

        socket.write(`data: ${JSON.stringify({ type: "metadata", msg: "connected" })}\n\n`);
        session.push({ workflowId, socketId, socket });
    }

    public static unregister(workflowId: string, socketId: string): void {
        if (!SocketSessionHandler.sessions.has(workflowId)) {
            return;
        }

        const sessions = SocketSessionHandler.sessions.get(workflowId);
        if (!sessions) {
            return;
        }

        const index = sessions.findIndex((s) => s.socketId === socketId);
        if (index === -1) {
            return;
        }

        const session = sessions[index];
        try {
            session.socket.end();
        } catch (e) {
            Logger.error(
                `Failed to close socket ${session.socketId} for workflow ${session.workflowId}, error: ${e}`
            );
        }

        sessions.splice(index, 1);
    }

    public static registerHandler(type: string, callback: (workflow: object) => void): void {
        if (SocketSessionHandler.handlers.has(type)) {
            Logger.warn(`Overwriting existing handler for type ${type}`);
        }
        SocketSessionHandler.handlers.set(type, callback);
    }

    public static broadcast(workflowId: string, type: BroadcastType, message: string): void {
        try {
            const workflowObj = parseWorkflowId(workflowId);
            if (SocketSessionHandler.handlers.has(workflowObj.platform)) {
                const handler = SocketSessionHandler.handlers.get(workflowObj.platform);
                if (handler) {
                    handler(workflowObj, type, message);
                }
            }
        } catch (e) {
            Logger.error(`Failed to parse workflowId ${workflowId}, error: ${e}`);
        }

        if (!SocketSessionHandler.sessions.has(workflowId)) {
            Logger.error(`No sessions found for workflow ${workflowId}`);
            return;
        }

        const sessions = SocketSessionHandler.sessions.get(workflowId);
        if (!sessions) {
            Logger.error(`Session map is undefined for workflow ${workflowId}`);
            return;
        }

        Logger.info(
            `Broadcasting message to ${sessions.length} sessions for workflow ${workflowId}`
        );
        for (const session of sessions) {
            try {
                session.socket.write(`data: ${JSON.stringify({ type, msg: message })}\n\n`);
            } catch (e) {
                Logger.error(
                    `Failed to send message to socket ${session.socketId} for user ${session.workflowId}, error: ${e}`
                );
            }
        }
    }
}
