import { PrismaClient } from "@prisma/client";
import { Database } from "./sqlite";
import { Config } from "./config";
import { Message } from "ollama";

export async function HennosGroupAsync(chatId: number, name?: string): Promise<HennosGroup> {
    const group = new HennosGroup(chatId);
    await group.setBasicInfo(name);
    await group.getBasicInfo();
    return group;
}

export class HennosGroup {
    public chatId: number;

    public displayName: string;

    public whitelisted: boolean;

    private db: PrismaClient;

    constructor(chatId: number) {
        this.chatId = chatId;
        this.whitelisted = false;
        this.db = Database.instance();
        this.displayName = "HennosGroup";
    }

    public toString(): string {
        return `Group - ${this.displayName} ${String(this.chatId)}`;
    }

    public allowFunctionCalling(): boolean {
        return Config.TELEGRAM_BOT_ADMIN === this.chatId;
    }

    public async setBasicInfo(name: string | undefined) {
        const result = await this.db.group.upsert({
            select: {
                whitelisted: true
            },
            where: {
                chatId: this.chatId
            },
            update: {
                name
            },
            create: {
                chatId: this.chatId,
                name: name ?? "Group Chat"
            }
        });
        this.whitelisted = result.whitelisted;
    }

    public async getBasicInfo() {
        const result = await this.db.group.findUniqueOrThrow({
            select: {
                whitelisted: true,
                name: true
            },
            where: {
                chatId: this.chatId
            }
        });

        this.whitelisted = result.whitelisted;
        this.displayName = result.name;
        return {
            name: result.name
        };
    }

    public async getChatContext(): Promise<Message[]> {
        const result = await this.db.messages.findMany({
            where: {
                chatId: this.chatId
            },
            select: {
                content: true,
                role: true
            },
            orderBy: {
                id: "desc"
            },
            take: 10
        });

        return result.reverse();
    }

    public async updateChatContext(role: "user" | "assistant" | "system", content: string): Promise<void> {
        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role,
                content
            }
        });
    }

    public async clearChatContext(): Promise<void> {
        await this.db.messages.deleteMany({
            where: {
                chatId: this.chatId
            }
        });
    }
}