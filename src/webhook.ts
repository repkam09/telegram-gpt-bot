import { Config } from "./singletons/config";
import { Logger } from "./singletons/logger";
import type { BroadcastInput } from "./temporal/agent/activities/persist";

// Type defined in the Lifeforce project
type BroadcastPayload = {
    workflowId: string;
    name: string;
    message: {
        __type: "user-msg" | "assistant-msg";
        value: string
    };
};

export class LifeforceWebhook {

    public static async init(): Promise<void> {
        const healthy = await this.health();
        if (healthy) {
            Logger.info(undefined, "LifeforceWebhook: Successfully connected to Lifeforce service");
        } else {
            Logger.error(undefined, "LifeforceWebhook: Failed to connect to Lifeforce service");
            throw new Error("Lifeforce service is not healthy");
        }
    }

    public static async health(): Promise<boolean> {
        try {
            const response = await fetch(`${Config.LIFEFORCE_BASE_URL}/api/health`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${Config.LIFEFORCE_AUTH_TOKEN}`
                }
            });

            return response.ok;
        } catch (error: unknown) {
            const err = error as Error;
            Logger.error(undefined, `LifeforceWebhook: Health check failed: ${err.message}`);
            return false;
        }
    }

    public static async broadcast(input: BroadcastInput): Promise<void> {
        const payload: BroadcastPayload = {
            workflowId: input.workflowId,
            name: input.name,
            message: {
                __type: input.type === "user-message" ? "user-msg" : "assistant-msg",
                value: input.message
            }
        };

        if (Config.HENNOS_DEVELOPMENT_MODE) {
            console.log("LifeforceWebhook Broadcast Payload:", JSON.stringify(payload, null, 2));
            return;
        }

        // Send a POST request to the Lifeforce endpoint
        const response = await fetch(`${Config.LIFEFORCE_BASE_URL}/api/internal/hennos/callback`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Config.LIFEFORCE_AUTH_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            Logger.error(undefined, `LifeforceWebhook: Failed to broadcast message. Status: ${response.status}, Response: ${errorText}`);
        } else {
            Logger.debug(undefined, "LifeforceWebhook: Successfully broadcasted message.");
        }
    }
}