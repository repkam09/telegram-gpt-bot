import { Logger } from "./singletons/logger";
import { parseWorkflowId } from "./temporal/agent/interface";

export class AgentResponseHandler {
    private static listeners: Map<string, (message: string, chatId: string) => Promise<void>> = new Map();
    private static artifactListeners: Map<string, (filePath: string, chatId: string, description?: string) => Promise<void>> = new Map();

    public static registerListener(type: string, callback: (message: string, chatId: string) => Promise<void>): void {
        Logger.info(undefined, `Registering listener for platform: ${type}`);
        this.listeners.set(type, callback);
    }

    public static registerArtifactListener(type: string, callback: (filePath: string, chatId: string, description?: string) => Promise<void>): void {
        Logger.info(undefined, `Registering artifact listener for platform: ${type}`);
        this.artifactListeners.set(type, callback);
    }

    public static async handle(workflowId: string, message: string): Promise<void> {
        const workflowInfo = parseWorkflowId(workflowId);

        const listener = this.listeners.get(workflowInfo.platform);
        if (listener) {
            await listener(message, workflowInfo.chatId);
        } else {
            Logger.warn(undefined, `No listener registered for platform: ${workflowInfo.platform}`);
        }
    }

    public static async handleArtifact(workflowId: string, filePath: string, description?: string): Promise<void> {
        const workflowInfo = parseWorkflowId(workflowId);
        const listener = this.artifactListeners.get(workflowInfo.platform);
        if (listener) {
            await listener(filePath, workflowInfo.chatId, description);
        } else {
            Logger.warn(undefined, `No artifact listener registered for platform: ${workflowInfo.platform}`);
        }
    }
}
