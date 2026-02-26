import { Client, Connection } from "@temporalio/client";
import { Config } from "./config";

export async function createTemporalClient() {
    const connection = await Connection.connect({ address: `${Config.TEMPORAL_HOST}:${Config.TEMPORAL_PORT}` });
    const client = new Client({ connection });
    return client;
}