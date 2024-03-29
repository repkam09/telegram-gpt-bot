import { PrismaClient } from "@prisma/client";
import { Database } from "./sqlite";
import OpenAI from "openai";
import { Config } from "./config";
import { ValidTTSNames } from "../handlers/voice";

export class HennosUser {
    public chatId: number;

    public whitelisted: boolean;

    private db: PrismaClient;

    constructor(chatId: number) {
        this.chatId = chatId;
        this.whitelisted = false;
        this.db = Database.instance();
    }

    public isAdmin(): boolean {
        return Config.TELEGRAM_BOT_ADMIN === this.chatId;
    }

    public toString(): string {
        return String(this.chatId);
    }

    static setWhitelisted(user: HennosUser, whitelisted: boolean) {
        const db = Database.instance();
        return db.user.update({
            where: {
                chatId: user.chatId
            },
            data: {
                whitelisted
            }
        });
    }

    static async exists(chatId: number): Promise<HennosUser | null> {
        const db = Database.instance();
        const result = await db.user.findUnique({
            select: {
                chatId: true
            },
            where: {
                chatId
            }
        });

        if (!result) {
            return null;
        }

        const instance = new HennosUser(Number(result.chatId));
        await instance.getBasicInfo();
        return instance;
    }

    public async getBasicInfo() {
        const result = await this.db.user.findUniqueOrThrow({
            select: {
                whitelisted: true,
                firstName: true,
                lastName: true,
                username: true,
                latitude: true,
                longitude: true
            },
            where: {
                chatId: this.chatId
            }
        });

        this.whitelisted = result.whitelisted;
        return {
            firstName: result.firstName,
            lastName: result.lastName,
            username: result.username,
            location: (result.latitude && result.longitude) ? {
                latitude: result.latitude,
                longitude: result.longitude
            } : null
        };
    }

    public async getPreferences() {
        const result = await this.db.user.findUniqueOrThrow({
            select: {
                preferredName: true,
                botName: true,
                voice: true,
            },
            where: {
                chatId: this.chatId
            }
        });
        return {
            preferredName: result.preferredName,
            botName: result.botName,
            voice: result.voice ? result.voice as ValidTTSNames : "onyx" as ValidTTSNames,
            personality: "default"
        };
    }

    public async setPreferredName(name: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                preferredName: name
            }
        });
    }

    public async setPreferredBotName(name: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                botName: name
            }
        });
    }

    public async setPreferredVoice(name: string): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                voice: name
            }
        });
    }

    public async setBasicInfo(firstName: string, lastName?: string, username?: string) {
        const record = await this.db.user.upsert({
            select: {
                whitelisted: true
            },
            where: {
                chatId: this.chatId
            },
            update: {
                firstName,
                lastName,
                username
            },
            create: {
                chatId: this.chatId,
                firstName,
                lastName,
                username,
                whitelisted: this.isAdmin()
            }
        });
        this.whitelisted = record.whitelisted;
    }

    public async updateLocation(latitude: number, longitude: number): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                latitude,
                longitude
            }
        });
    }

    public async getChatContext(): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
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
            take: 50
        });

        return result.reverse() as OpenAI.Chat.ChatCompletionMessageParam[];
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