import { Database } from "./data/sqlite";
import { Config } from "./config";
import { HennosBaseProvider } from "./llms/base";
import { HennosImage, HennosMessage, HennosMessageRole, HennosResponse, ValidLLMProvider, ValidTTSName } from "../types";
import { HennosOllamaSingleton } from "./llms/ollama";
import { HennosOpenAISingleton } from "./llms/openai";
import { HennosAnthropicSingleton } from "./llms/anthropic";
import { Logger } from "./logger";
import { PrismaClient } from "@prisma/client";
import { OpenAI, OpenAIEmbedding, ServiceContext, serviceContextFromDefaults, SimpleNodeParser } from "llamaindex";
import { loadHennosImage } from "../handlers/photos";
import { HennosBedrockSingleton } from "./llms/bedrock";
import { HennosWorkflowUser } from "../services/temporal/common/types";

type LastActiveResult = { user: { date: Date, content: string } | null, assistant: { date: Date, content: string } | null }

export type HennosConsumer = HennosUser | HennosGroup

export async function isBlacklisted(chatId: number): Promise<{ chatId: number, datetime: Date } | false> {
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

export async function HennosAnonUser(): Promise<HennosUser> {
    const user = new HennosUser(-1);
    await user.clearChatContext();
    user.displayName = "Anon";
    user.whitelisted = false;
    user.experimental = false;
    user.provider = "ollama";
    return user;
}

export async function HennosUserFromWorkflowUser(workflowUser: HennosWorkflowUser): Promise<HennosUser> {
    const user = new HennosUser(-1);
    await user.clearChatContext();
    user.displayName = workflowUser.displayName ?? "WorkflowUser";
    user.whitelisted = workflowUser.isWhitelisted;
    user.experimental = workflowUser.isExperimental;
    user.provider = workflowUser.provider;
    return user;
}

export class HennosUser {
    public chatId: number;
    public displayName: string;
    public db: PrismaClient;
    public whitelisted: boolean;
    public experimental: boolean;
    public provider: ValidLLMProvider;

    constructor(chatId: number) {
        this.chatId = chatId;
        this.db = Database.instance();
        this.displayName = "HennosUser";
        this.whitelisted = false;
        this.experimental = false;
        this.provider = "openai";
    }

    public toString(): string {
        return `${this.displayName} ${String(this.chatId)}`;
    }

    public getServiceContext(): ServiceContext {
        return serviceContextFromDefaults({
            llm: new OpenAI({
                model: Config.OPENAI_MINI_LLM.MODEL,
                apiKey: Config.OPENAI_API_KEY,
                temperature: 1
            }),
            embedModel: new OpenAIEmbedding({
                model: Config.OPENAI_LLM_EMBED.MODEL,
                apiKey: Config.OPENAI_API_KEY
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 2048,
                chunkOverlap: 256
            })
        });
    }

    public allowFunctionCalling(): boolean {
        if (this.isAdmin()) {
            return true;
        }

        if (this.whitelisted) {
            return true;
        }

        return false;
    }

    public isAdmin(): boolean {
        if (Config.TELEGRAM_BOT_ADMIN === this.chatId) {
            return true;
        }

        return false;
    }

    public getProvider(): HennosBaseProvider {
        if (this.whitelisted) {
            switch (this.provider) {
                case "openai": {
                    return HennosOpenAISingleton.instance();
                }
                case "ollama": {
                    return HennosOllamaSingleton.instance();
                }
                case "anthropic": {
                    return HennosAnthropicSingleton.instance();
                }
                case "bedrock": {
                    return HennosBedrockSingleton.instance();
                }
                default: {
                    Logger.warn(this, `Unknown provider ${this.provider}, defaulting to OpenAI`);
                    return HennosOpenAISingleton.instance();
                }
            }
        }
        return HennosOpenAISingleton.mini();
    }


    public async lastActive(): Promise<LastActiveResult> {
        const response: LastActiveResult = { user: null, assistant: null };
        const userResult = await this.db.messages.findFirst({
            select: {
                datetime: true,
                content: true
            },
            where: {
                chatId: this.chatId,
                role: "user",
            },
            orderBy: {
                datetime: "desc"
            }
        });

        if (userResult) {
            response.user = {
                date: userResult.datetime,
                content: userResult.content
            };
        }

        const assistantResult = await this.db.messages.findFirst({
            select: {
                datetime: true,
                content: true
            },
            where: {
                chatId: this.chatId,
                role: "assistant",
            },
            orderBy: {
                datetime: "desc"
            }
        });

        if (assistantResult) {
            response.assistant = {
                date: assistantResult.datetime,
                content: assistantResult.content
            };
        }

        return response;
    }

    public async getBasicInfo() {
        const result = await this.db.user.findUniqueOrThrow({
            select: {
                whitelisted: true,
                firstName: true,
                lastName: true,
                username: true,
                latitude: true,
                longitude: true,
                experimental: true,
                provider: true
            },
            where: {
                chatId: this.chatId
            }
        });

        this.whitelisted = this.isAdmin() ? true : result.whitelisted;
        this.experimental = this.isAdmin() ? true : result.experimental;
        this.displayName = `${result.firstName} ${result.lastName ?? ""}`.trim();
        this.provider = result.provider as ValidLLMProvider;

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
                firstName: true,
                preferredName: true,
                botName: true,
                voice: true,
                whitelisted: true
            },
            where: {
                chatId: this.chatId
            }
        });

        return {
            preferredName: result.preferredName ? result.preferredName : result.firstName,
            botName: result.botName ? result.botName : "Hennos",
            voice: result.voice ? result.voice as ValidTTSName : "onyx" as ValidTTSName,
            personality: "default"
        };
    }


    public async updateAssistantChatContext(content: string | HennosResponse) {
        if (!content) {
            Logger.warn(this, "Empty content provided to updateAssistantChatContext");
            return;
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
        if (!content) {
            Logger.warn(this, "Empty content provided to updateSystemChatContext");
            return;
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
        if (!content) {
            Logger.warn(this, "Empty content provided to updateUserChatContext");
            return;
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

    public async updateUserChatImageContext(image: HennosImage): Promise<void> {
        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role: "user",
                type: "image",
                content: JSON.stringify({
                    local: image.local,
                    mime: image.mime,
                }),
                from: this.chatId
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

    public async getChatContext(limit: number = 100): Promise<HennosMessage[]> {
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
            take: limit
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

    public async setPreferredProvider(provider: ValidLLMProvider): Promise<void> {
        await this.db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                provider: provider
            }
        });
        this.provider = provider;
    }

    public async setBasicInfo(firstName: string, lastName?: string, username?: string) {
        const record = await this.db.user.upsert({
            select: {
                whitelisted: true,
                experimental: true
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
                whitelisted: this.isAdmin(),
                experimental: this.isAdmin()
            }
        });
        this.whitelisted = record.whitelisted;
        this.experimental = record.experimental;
    }

    public setWhitelisted(whitelisted: boolean) {
        const db = Database.instance();
        return db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                whitelisted
            }
        });
    }

    public setExperimental(experimental: boolean) {
        const db = Database.instance();
        return db.user.update({
            where: {
                chatId: this.chatId
            },
            data: {
                experimental
            }
        });
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

    static async async(chatId: number, firstName: string, lastName?: string, username?: string): Promise<HennosUser> {
        const user = new HennosUser(chatId);
        await user.setBasicInfo(firstName, lastName, username);
        await user.getBasicInfo();
        return user;
    }

    static async fromHennosLink(link: string): Promise<HennosUser | null> {
        const db = Database.instance();
        const result = await db.hennosLink.findUnique({
            select: {
                chatId: true
            },
            where: {
                link
            }
        });

        if (!result) {
            return null;
        }

        const instance = new HennosUser(Number(result.chatId));
        await instance.getBasicInfo();
        return instance;
    }
}


export class HennosGroup {

    public chatId: number;
    public displayName: string;
    public db: PrismaClient;
    public whitelisted: boolean;
    public experimental: boolean;
    public provider: ValidLLMProvider;

    constructor(chatId: number) {
        this.chatId = chatId;
        this.db = Database.instance();
        this.displayName = "HennosGroup";
        this.whitelisted = false;
        this.experimental = false;
        this.provider = "openai";
    }

    public toString(): string {
        return `${this.displayName} ${String(this.chatId)}`;
    }

    public getServiceContext(): ServiceContext {
        return serviceContextFromDefaults({
            llm: new OpenAI({
                model: Config.OPENAI_MINI_LLM.MODEL,
                apiKey: Config.OPENAI_API_KEY,
                temperature: 1
            }),
            embedModel: new OpenAIEmbedding({
                model: Config.OPENAI_LLM_EMBED.MODEL,
                apiKey: Config.OPENAI_API_KEY
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 2048,
                chunkOverlap: 256
            })
        });
    }

    public allowFunctionCalling(): boolean {
        if (this.whitelisted) {
            return true;
        }

        return false;
    }

    public isAdmin(): boolean {
        return false;
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

    public getProvider() {
        if (this.whitelisted) {
            return HennosOpenAISingleton.instance();
        }
        return HennosOpenAISingleton.mini();
    }


    public async updateAssistantChatContext(content: string | HennosResponse) {
        if (!content) {
            Logger.warn(this, "Empty content provided to updateAssistantChatContext");
            return;
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
        if (!content) {
            Logger.warn(this, "Empty content provided to updateSystemChatContext");
            return;
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
        if (!content) {
            Logger.warn(this, "Empty content provided to updateUserChatContext");
            return;
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

    public async updateUserChatImageContext(image: HennosImage): Promise<void> {
        await this.db.messages.create({
            data: {
                chatId: this.chatId,
                role: "user",
                type: "image",
                content: JSON.stringify({
                    local: image.local,
                    mime: image.mime,
                }),
                from: this.chatId
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

    public async getChatContext(limit: number = 100): Promise<HennosMessage[]> {
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
            take: limit
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

    public setWhitelisted(whitelisted: boolean) {
        const db = Database.instance();
        return db.group.update({
            where: {
                chatId: this.chatId
            },
            data: {
                whitelisted
            }
        });
    }

    static async async(chatId: number, name?: string): Promise<HennosGroup> {
        const group = new HennosGroup(chatId);
        await group.setBasicInfo(name);
        await group.getBasicInfo();
        return group;
    }

    static async exists(chatId: number): Promise<HennosGroup | null> {
        const db = Database.instance();
        const result = await db.group.findUnique({
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

        const instance = new HennosGroup(Number(result.chatId));
        await instance.getBasicInfo();
        return instance;
    }
}