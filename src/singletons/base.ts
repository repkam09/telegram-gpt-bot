import { Database } from "./sqlite";
import { PrismaClient } from "@prisma/client";
import { Config } from "./config";
import { HennosImage, HennosMessage, HennosMessageRole, HennosResponse, HennosTextMessage, ValidLLMProvider } from "../types";
import { Qdrant } from "./qdrant";
import { loadHennosImage } from "../handlers/photos";
import { Logger } from "./logger";
import { HennosUser } from "./user";
import {
    OpenAI,
    OpenAIEmbedding,
    ServiceContext,
    SimpleNodeParser,
    serviceContextFromDefaults,
} from "llamaindex";

export abstract class HennosBaseProvider {
    public abstract completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse>;
    public abstract moderation(req: HennosConsumer, input: string): Promise<boolean>;
    public abstract transcription(req: HennosConsumer, path: string | Buffer): Promise<HennosResponse>;
    public abstract speech(req: HennosConsumer, input: string): Promise<HennosResponse>;
    public abstract details(): string;
}

export abstract class HennosConsumer {
    public chatId: number;
    public displayName: string;
    public db: PrismaClient;
    public whitelisted: boolean;
    public experimental: boolean;
    public provider: ValidLLMProvider;

    constructor(chatId: number, displayName: string) {
        this.chatId = chatId;
        this.db = Database.instance();
        this.displayName = displayName;
        this.whitelisted = false;
        this.experimental = false;
        this.provider = "openai";
    }

    public abstract allowFunctionCalling(): boolean;

    public toString(): string {
        return `${this.displayName} ${String(this.chatId)}`;
    }

    public async facts(): Promise<{ key: string, value: string }[]> {
        const result = await this.db.keyValueMemory.findMany({
            where: {
                chatId: this.chatId
            },
            select: {
                key: true,
                value: true
            }
        });

        return result;
    }

    public abstract getProvider(): HennosBaseProvider;
    public abstract isAdmin(): boolean

    public getServiceContext(): ServiceContext {
        return serviceContextFromDefaults({
            llm: new OpenAI({
                model: Config.OPENAI_MINI_LLM.MODEL,
                apiKey: Config.OPENAI_API_KEY
            }),
            embedModel: new OpenAIEmbedding({
                model: Config.OPENAI_LLM_EMBED.MODEL,
                apiKey: Config.OPENAI_API_KEY,
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 2048,
                chunkOverlap: 256
            })
        });
    }

    public async updateAssistantChatContext(content: string | HennosResponse) {
        if (Config.QDRANT_ENABLED) {
            const collection = await Qdrant.instance().collectionExists(String(this.chatId));
            if (!collection.exists) {
                await Qdrant.instance().createCollection(String(this.chatId), {});
            }
        }

        if (typeof content === "string") {
            await this.db.messages.create({
                data: {
                    chatId: this.chatId,
                    role: "assistant",
                    content,
                    from: -1
                }
            });
        } else {
            if (content.__type === "string") {
                await this.db.messages.create({
                    data: {
                        chatId: this.chatId,
                        role: "assistant",
                        content: content.payload,
                        from: -1
                    }
                });
            }
        }
    }

    public async updateSystemChatContext(content: string) {
        if (Config.QDRANT_ENABLED) {
            const collection = await Qdrant.instance().collectionExists(String(this.chatId));
            if (!collection.exists) {
                await Qdrant.instance().createCollection(String(this.chatId), {});
            }
        }

        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role: "system",
                content,
                from: -1
            }
        });
    }

    public async updateUserChatContext(from: HennosUser, content: string): Promise<void> {
        if (Config.QDRANT_ENABLED) {
            const collection = await Qdrant.instance().collectionExists(String(this.chatId));
            if (!collection.exists) {
                await Qdrant.instance().createCollection(String(this.chatId), {});
            }
        }
        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role: "user",
                content,
                from: from.chatId
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

    public async getChatContext(): Promise<HennosMessage[]> {
        const result = await this.db.messages.findMany({
            where: {
                chatId: this.chatId,
            },
            select: {
                role: true,
                content: true,
                type: true
            },
            orderBy: {
                id: "desc"
            },
            take: 100
        });

        const messages: HennosMessage[] = [];
        for (const message of result) {
            if (message.type === "image") {
                try {
                    const image = JSON.parse(message.content) as HennosImage;
                    const encoded = await loadHennosImage(image);
                    Logger.debug(this, `Loaded image from disk: ${image.local}`);
                    messages.push({
                        type: "image",
                        role: message.role as HennosMessageRole,
                        image,
                        encoded
                    });
                } catch (err) {
                    const error = err as Error;
                    Logger.error(this, `Unable to load image ${message.content}: ${error.message}`);
                }
            } else if (message.type === "text") {
                messages.push({
                    type: "text",
                    role: message.role as HennosMessageRole,
                    content: message.content
                });
            } else {
                Logger.warn(this, `Unknown message type ${message.type}`);
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