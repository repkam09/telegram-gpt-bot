import { Client, Connection } from "@temporalio/client";
import { Config } from "./config";
import { NativeConnection } from "@temporalio/worker";

export async function createTemporalClient() {
    const connection = await createTemporalConnection();
    const client = new Client({
        connection,
        namespace: Config.TEMPORAL_NAMESPACE,
    });
    return client;
}

export async function createTemporalConnection() {
    const connection = await Connection.connect({ address: `${Config.TEMPORAL_HOST}:${Config.TEMPORAL_PORT}`, apiKey: Config.TEMPORAL_API_KEY, tls: Config.TEMPORAL_USE_TLS });
    return connection;
}

export async function createTemporalNativeConnection() {
    const server = `${Config.TEMPORAL_HOST}:${Config.TEMPORAL_PORT}`;
    const connection = await NativeConnection.connect({
        address: server,
        apiKey: Config.TEMPORAL_API_KEY,
        tls: Config.TEMPORAL_USE_TLS,
    });
    return connection;
}