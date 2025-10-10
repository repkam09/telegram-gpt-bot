import { Client, Connection } from "@temporalio/client";
import { Config } from "./config";
import type { HennosWorkflowUser } from "../services/temporal/types";

export async function createTemporalClient() {
    const connection = await Connection.connect({ address: `${Config.TEMPORAL_HOST}:${Config.TEMPORAL_PORT}` });
    const client = new Client({ connection });
    return client;
}


export function createDefaultUser(userId: string): HennosWorkflowUser {
    return {
        userId: {
            __typename: "HennosWorkflowUserId" as const,
            value: userId
        },
        isAdmin: false,
        isExperimental: false,
        isWhitelisted: false,
        provider: "openai" as const,
    };
}