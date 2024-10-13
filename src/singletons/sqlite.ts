import { PrismaClient } from "@prisma/client";

export class Database {
    private static _prismaClient: PrismaClient;
    
    public static async init() {
        this._prismaClient = new PrismaClient();
    }

    public static instance(): PrismaClient {
        return this._prismaClient;
    }

    public static async disconnect() {
        await this._prismaClient.$disconnect();
    }
}