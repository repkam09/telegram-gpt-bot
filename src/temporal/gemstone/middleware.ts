import { signalGemstoneWorkflowMessage, createWorkflowId as createGemstoneWorkflowId } from "./interface";
import { Request, Response } from "express";
import { Logger } from "../../singletons/logger";

export class GemstoneMiddleware {
    public static postMessage() {
        return async (req: Request, res: Response) => {
            const sessionId = req.params.sessionId;
            if (!sessionId) {
                Logger.error(undefined, "Missing sessionId");
                return res.status(400).send("Missing sessionId");
            }

            if (Array.isArray(sessionId)) {
                Logger.error(undefined, "Invalid sessionId");
                return res.status(400).send("Invalid sessionId");
            }

            const workflowId = createGemstoneWorkflowId("webhook", sessionId);

            const message = req.body.message;
            if (!message) {
                Logger.error(workflowId, "Missing message");
                return res.status(400).send("Missing message");
            }

            const author = req.body.author;
            if (!author) {
                Logger.error(workflowId, "Missing author");
                return res.status(400).send("Missing author");
            }

            try {
                await signalGemstoneWorkflowMessage(workflowId, author, message);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error(workflowId, `Error signaling gemstone workflow message: ${error.message}`);
                return res.status(500).json({ status: "error", message: "error sending message" });
            }

            return res.status(200).json({ status: "ok" });
        };
    }
}