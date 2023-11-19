/* eslint-disable @typescript-eslint/no-explicit-any */

import { Prisma, PrismaClient } from "@prisma/client";
import { Config } from "./config";

export class Database {
    private static prisma: PrismaClient;

    static instance() {
        if (!this.prisma) {
            this.prisma = new PrismaClient();
        }
        return this.prisma;
    }

    static async upsertUser(chatId: number, first_name: string) {
        const prisma = this.instance();
        await prisma.user.upsert({
            where: {
                id: chatId
            },
            update: {
            },
            create: {
                id: chatId,
                name: first_name,
                botName: "Hennos",
                voice: "shimmer"
            }
        });
    }

    static async updateUser(chatId: number, data: Prisma.UserUpdateInput) {
        const prisma = this.instance();
        await prisma.user.update({
            where: {
                id: chatId
            },
            data
        });
    }

    static async putUserMessage(chatId: number, role: "user" | "assistant" | "system", content: string): Promise<void> {
        const prisma = this.instance();
        await prisma.message.create({
            data: {
                userId: chatId,
                content,
                role,
                date: new Date()
            },
            select: {
                userId: true,
            }
        });
    }

    static async getUserMessages(chatId: number) {
        const prisma = this.instance();
        const messages = await prisma.message.findMany({
            where: {
                userId: chatId
            },
            select: {
                content: true,
                role: true,
            },
            orderBy: {
                date: "desc"
            },
            take: Config.HENNOS_MAX_MESSAGE_MEMORY
        });

        return messages.reverse();
    }

    static async getUser(chatId: number, select: Prisma.UserSelect): Promise<any> {
        const prisma = this.instance();
        const user = await prisma.user.findUniqueOrThrow({
            where: {
                id: chatId
            },
            select
        });

        return user;
    }
}