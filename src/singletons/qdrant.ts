import { QdrantClient } from "@qdrant/js-client-rest";
import { Config } from "./config";

export class Qdrant {
    private static _qdrantClient: QdrantClient;

    public static async init() {
        this._qdrantClient = new QdrantClient({ url: `http://${Config.QDRANT_HOST}:${Config.QDRANT_PORT}` });
    }

    public static instance(): QdrantClient {
        return this._qdrantClient;
    }
}