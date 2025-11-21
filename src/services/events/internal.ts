import { Logger } from "../../singletons/logger";
import { parseWorkflowId } from "../temporal/workflows";

type BroadcastType = "message" | "usage";

export class InternalCallbackHandler {
    private static handlers: Map<string, (workflow: object, type: BroadcastType, message: string) => void> = new Map();

    public static registerHandler(type: string, callback: (workflow: object) => void): void {
        if (InternalCallbackHandler.handlers.has(type)) {
            Logger.warn(`Overwriting existing handler for type ${type}`);
        }
        InternalCallbackHandler.handlers.set(type, callback);
    }

    public static async broadcast(workflowId: string, type: BroadcastType, message: string): Promise<void> {
        try {
            const workflowObj = parseWorkflowId(workflowId);
            if (InternalCallbackHandler.handlers.has(workflowObj.platform)) {
                const handler = InternalCallbackHandler.handlers.get(workflowObj.platform);
                if (handler) {
                    handler(workflowObj, type, message);
                }
            }
        } catch (e) {
            Logger.error(`Failed to parse workflowId ${workflowId}, error: ${e}`);
        }
    }
}
