import { Client, Connection } from "@temporalio/client";
import { Config } from "./config";
import type { HennosWorkflowUser } from "../services/temporal/common/types";

export async function createTemporalClient() {
    const connection = await Connection.connect({ address: `${Config.TEMPORAL_HOST}:${Config.TEMPORAL_PORT}` });
    const client = new Client({ connection });
    return client;
}

export function createDefaultUser(userId: string, displayName: string): HennosWorkflowUser {
    return {
        userId: {
            __typename: "HennosWorkflowUserId" as const,
            value: userId
        },
        displayName: displayName,
        isAdmin: false,
        isExperimental: false,
        isWhitelisted: false,
        provider: "openai" as const,
    };
}

export function createWhitelistedUser(userId: string, displayName: string): HennosWorkflowUser {
    return {
        userId: {
            __typename: "HennosWorkflowUserId" as const,
            value: userId
        },
        displayName: displayName,
        isAdmin: false,
        isExperimental: false,
        isWhitelisted: true,
        provider: "openai" as const,
    };
}

export function createAdminUser(userId: string, displayName: string): HennosWorkflowUser {
    return {
        userId: {
            __typename: "HennosWorkflowUserId" as const,
            value: userId
        },
        displayName: displayName,
        isAdmin: true,
        isExperimental: true,
        isWhitelisted: true,
        provider: "openai" as const,
    };
}