import { Logger } from "./singletons/logger";

type MessageListener = (message: string, chatId: string) => Promise<void>;
type ArtifactListener = (filePath: string, chatId: string, mime_type: string, description?: string) => Promise<void>;
type StatusListener = (event: StatusListenerEvent, chatId: string) => Promise<void>;

export interface StatusListenerEvent { type: StatusListenerEventType; payload?: unknown }
export type StatusListenerEventType = "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "find_location" | "record_video_note" | "upload_video_note";

export class AgentResponseHandler {
    private static messageListeners: Map<string, MessageListener> = new Map();
    private static artifactListeners: Map<string, ArtifactListener> = new Map();
    private static statusListeners: Map<string, StatusListener> = new Map();

    public static registerMessageListener(type: string, callback: MessageListener): void {
        Logger.info("AgentResponseHandler", `Registering message listener for platform: ${type}`);
        this.messageListeners.set(type, callback);
    }

    public static unregisterMessageListener(type: string): void {
        Logger.info("AgentResponseHandler", `Unregistering message listener for platform: ${type}`);
        this.messageListeners.delete(type);
    }

    public static registerArtifactListener(type: string, callback: ArtifactListener): void {
        Logger.info("AgentResponseHandler", `Registering artifact listener for platform: ${type}`);
        this.artifactListeners.set(type, callback);
    }

    public static unregisterArtifactListener(type: string): void {
        Logger.info("AgentResponseHandler", `Unregistering artifact listener for platform: ${type}`);
        this.artifactListeners.delete(type);
    }

    public static registerStatusListener(type: string, callback: StatusListener): void {
        Logger.info("AgentResponseHandler", `Registering status listener for platform: ${type}`);
        this.statusListeners.set(type, callback);
    }

    public static unregisterStatusListener(type: string): void {
        Logger.info("AgentResponseHandler", `Unregistering status listener for platform: ${type}`);
        this.statusListeners.delete(type);
    }

    public static async handleStatus(workflowId: string, event: StatusListenerEvent): Promise<void> {
        try {
            const workflowInfo = JSON.parse(workflowId);
            if (!workflowInfo.platform || !workflowInfo.chatId) {
                Logger.error(workflowId, `Invalid workflowId format: ${workflowId} for status handling. Expected properties 'platform' and 'chatId' not found.`);
                return;
            }

            const listener = this.statusListeners.get(workflowInfo.platform);
            if (listener) {
                await listener(event, workflowInfo.chatId);
            } else {
                Logger.warn(workflowId, `No status listener registered for platform: ${workflowInfo.platform}`);
            }
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `Failed to parse workflowId: ${workflowId}. Error: ${error.message}`, error);
        }
    }

    public static async handleMessage(workflowId: string, message: string): Promise<void> {
        try {
            const workflowInfo = JSON.parse(workflowId);
            if (!workflowInfo.platform || !workflowInfo.chatId) {
                Logger.error(workflowId, `Invalid workflowId format: ${workflowId} for message handling. Expected properties 'platform' and 'chatId' not found.`);
                return;
            }

            const listener = this.messageListeners.get(workflowInfo.platform);
            if (listener) {
                await listener(message, workflowInfo.chatId);
            } else {
                Logger.warn(workflowId, `No message listener registered for platform: ${workflowInfo.platform}`);
            }
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `Failed to parse workflowId: ${workflowId}. Error: ${error.message}`, error);
        }
    }

    public static async handleArtifact(workflowId: string, filePath: string, mime_type: string, description?: string): Promise<void> {
        try {
            const workflowInfo = JSON.parse(workflowId);
            if (!workflowInfo.platform || !workflowInfo.chatId) {
                Logger.error(workflowId, `Invalid workflowId format: ${workflowId} for artifact handling. Expected properties 'platform' and 'chatId' not found.`);
                return;
            }

            const listener = this.artifactListeners.get(workflowInfo.platform);
            if (listener) {
                await listener(filePath, workflowInfo.chatId, mime_type, description);
            } else {
                Logger.warn(workflowId, `No artifact listener registered for platform: ${workflowInfo.platform}`);
            }
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `Failed to parse workflowId: ${workflowId}. Error: ${error.message}`, error);
        }
    }
}
