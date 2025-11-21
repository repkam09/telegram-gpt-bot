import { Logger } from "../../singletons/logger";
import { parseWorkflowId } from "../temporal/workflows";

export type BroadcastType = "message" | "usage";
export type HandlerCallback = (workflow: object, type: BroadcastType, message: string) => void;

export class InternalCallbackHandler {
    private static handlers: Map<string, HandlerCallback> = new Map();

    public static registerHandler(type: string, callback: HandlerCallback): void {
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
            // Ignore parsing errors, this is normal if the workflow is not an internal one
            Logger.debug("InternalCallbackHandler: Failed to parse workflow ID", e);
        }
    }
}
