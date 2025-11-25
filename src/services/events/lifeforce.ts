import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import type { BroadcastInput } from "../temporal/activities";

// Type defined in the Lifeforce project
type BroadcastPayload = {
    workflowId: string;
    userId: string;
    message: {
        __type: "user-msg" | "assistant-msg";
        value: string
    };
};

export class LifeforceBroadcast {

    public static async init(): Promise<void> {
        const healthy = await this.health();
        if (healthy) {
            Logger.info("LifeforceBroadcast: Successfully connected to Lifeforce service");
        } else {
            Logger.error("LifeforceBroadcast: Failed to connect to Lifeforce service");
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
        } catch (error) {
            Logger.error("LifeforceBroadcast: Health check failed", error);
            return false;
        }
    }

    public static async broadcast(input: BroadcastInput): Promise<void> {
        if (!Config.LIFEFORCE_ENABLED) {
            Logger.debug("LifeforceBroadcast: Broadcasting is disabled via configuration");
            return;
        }

        if (input.type !== "user-message" && input.type !== "agent-message") {
            Logger.debug("LifeforceBroadcast: Unsupported input type for broadcasting:", input.type);
            return;
        }

        const payload: BroadcastPayload = {
            workflowId: input.workflowId,
            userId: input.user.userId.value,
            message: {
                __type: input.type === "user-message" ? "user-msg" : "assistant-msg",
                value: input.message
            }
        };

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
            Logger.error(`LifeforceBroadcast: Failed to broadcast message. Status: ${response.status}, Response: ${errorText}`);
        } else {
            Logger.debug("LifeforceBroadcast: Successfully broadcasted message.");
        }
    }
}