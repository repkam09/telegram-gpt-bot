import fs from "fs/promises";
import { Message } from "ollama";
import { HennosUser } from "./user";
import { Database } from "./sqlite";
import { PrismaClient } from "@prisma/client";
import { Config } from "./config";
import { Logger } from "./logger";

export type HennosResponse = HennosStringResponse | HennosEmptyResponse | HennosArrayBufferResponse | HennosErrorResponse;

export type HennosErrorResponse = {
    __type: "error"
    payload: string
}

export type HennosStringResponse = {
    __type: "string"
    payload: string
}

export type HennosEmptyResponse = {
    __type: "empty"
}

export type HennosArrayBufferResponse = {
    __type: "arraybuffer"
    payload: ArrayBuffer
}

export type HennosImage = {
    local: string,
    mime: string
}

export type HennosRoles = "user" | "assistant" | "system";

export type HennosEncodedImage = string;

const HennosMediaSelect = {
    id: true,
    type: true,
    chatId: true,
    local: true,
    mimeType: true
};

export type HennosMediaRecord = {
    local: string,
    mimeType: string,
    type: string,
}

export abstract class HennosBaseProvider {
    public abstract completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<HennosResponse>;
    public abstract moderation(req: HennosConsumer, input: string): Promise<boolean>;
    public abstract transcription(req: HennosConsumer, path: string): Promise<HennosResponse>;
    public abstract speech(user: HennosUser, input: string): Promise<HennosResponse>;
}

export abstract class HennosConsumer {
    public chatId: number;
    public displayName: string;
    public db: PrismaClient;
    public whitelisted: boolean;
    public experimental: boolean;

    constructor(chatId: number, displayName: string) {
        this.chatId = chatId;
        this.db = Database.instance();
        this.displayName = displayName;
        this.whitelisted = false;
        this.experimental = false;
    }

    public abstract allowFunctionCalling(): boolean;

    public toString(): string {
        return `${this.displayName} ${String(this.chatId)}`;
    }

    public async updateChatContextImage(role: HennosRoles, image: HennosImage): Promise<void> {
        const media = await this.db.media.create({
            data: {
                type: `${role}_image`,
                chatId: this.chatId,
                local: image.local,
                mimeType: image.mime
            }
        });

        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role: `${role}_image`,
                content: String(media.id),
            }
        });
    }

    public async updateChatContext(role: HennosRoles, content: string | HennosResponse): Promise<void> {
        if (Config.QDRANT_ENABLED) {
            const collection = await Database.vector().collectionExists(String(this.chatId));
            if (!collection.exists) {
                await Database.vector().createCollection(String(this.chatId), {});
            }
        }

        if (typeof content === "string") {
            await this.db.messages.create({
                data: {
                    chatId: this.chatId,
                    role,
                    content
                }
            });
        } else {
            if (content.__type === "string") {
                await this.db.messages.create({
                    data: {
                        chatId: this.chatId,
                        role,
                        content: content.payload
                    }
                });
            }
        }
    }

    public async clearChatContext(): Promise<void> {
        await this.db.messages.deleteMany({
            where: {
                chatId: this.chatId
            }
        });
        await this.db.media.deleteMany({
            where: {
                chatId: this.chatId
            }
        });
        if (Config.QDRANT_ENABLED) {
            await Database.vector().deleteCollection(String(this.chatId));
        }

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

        const messages: Message[] = [];
        for (const message of result) {
            switch (message.role) {
                case "user_image": {
                    const media: HennosMediaRecord | null = await this.db.media.findUnique({
                        select: HennosMediaSelect,
                        where: {
                            id: parseInt(message.content)
                        }
                    });
                    if (media) {
                        try {
                            const raw = await fs.readFile(media.local);
                            const data = Buffer.from(raw).toString("base64");
                            messages.push({
                                role: "user_image",
                                images: [data],
                                content: JSON.stringify({
                                    mimeType: media.mimeType,
                                    local: media.local,
                                    type: media.type
                                } as HennosMediaRecord)
                            });
                        } catch (e) {
                            Logger.warn(this, `Failed to read image with id ${message.content}: ${e}`);
                        }
                    } else {
                        Logger.warn(this, `Failed to find media record with id ${message.content}`);
                    }
                    break;
                }

                case "assistant_image": {
                    const media: HennosMediaRecord | null = await this.db.media.findUnique({
                        where: {
                            id: parseInt(message.content)
                        }
                    });
                    if (media) {
                        messages.push({
                            role: "assistant_image",
                            content: JSON.stringify(media)
                        });
                    } else {
                        Logger.warn(this, `Failed to find media with id ${message.content}`);
                    }
                    break;
                }

                default: {
                    messages.push({
                        role: message.role as HennosRoles,
                        content: message.content
                    });
                    break;
                }
            }
        }

        return messages.reverse();
    }

    public static async isBlacklisted(chatId: number): Promise<{ chatId: number, datetime: Date } | false> {
        const db = Database.instance();
        const result = await db.blacklist.findUnique({
            where: {
                chatId
            },
            select: {
                datetime: true
            }
        });
        if (!result) {
            return false;
        }
        return {
            chatId,
            datetime: result.datetime
        };
    }
}