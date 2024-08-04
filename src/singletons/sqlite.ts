import { PrismaClient } from "@prisma/client";
import { QdrantClient } from "@qdrant/js-client-rest";
import { Config } from "./config";

export class Database {
    private static _prismaClient: PrismaClient;
    private static _qdrantClient: QdrantClient;

    public static async init() {
        this._prismaClient = new PrismaClient();
        if (Config.QDRANT_ENABLED) {
            this._qdrantClient = new QdrantClient({ url: `http://${Config.QDRANT_HOST}:${Config.QDRANT_PORT}` });
        }
    }

    public static instance(): PrismaClient {
        return this._prismaClient;
    }

    public static vector(): QdrantClient {
        return this._qdrantClient;
    }

    public static async disconnect() {
        await this._prismaClient.$disconnect();
    }
}