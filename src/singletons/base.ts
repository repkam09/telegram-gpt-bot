import { Message } from "ollama";
import { HennosUser } from "./user";
import { Database } from "./sqlite";
import { PrismaClient } from "@prisma/client";

export abstract class HennosBaseProvider {
    public abstract completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string>;
    public abstract vision(req: HennosConsumer, prompt: Message, remote: string, mime: string): Promise<string>;
    public abstract moderation(req: HennosConsumer, input: string): Promise<boolean>;
    public abstract transcription(req: HennosConsumer, path: string): Promise<string>;
    public abstract speech(user: HennosUser, input: string): Promise<ArrayBuffer>;
}

export abstract class HennosConsumer {
    public chatId: number;
    public displayName: string;
    public db: PrismaClient;
    public whitelisted: boolean;

    constructor(chatId: number, displayName: string) {
        this.chatId = chatId;
        this.db = Database.instance();
        this.displayName = displayName;
        this.whitelisted = false;
    }

    public abstract allowFunctionCalling(): boolean;

    public toString(): string {
        return `${this.displayName} ${String(this.chatId)}`;
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

    public async getChatContext(): Promise<Message[]> {
        const result = await this.db.messages.findMany({
            where: {
                chatId: this.chatId
            },
            select: {
                role: true,
                content: true
            },
            orderBy: {
                id: "desc"
            },
            take: 100
        });

        return result.reverse();
    }
}