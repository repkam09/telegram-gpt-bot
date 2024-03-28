import OpenAI from "openai";
import { Database } from "./sqlite";
import { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources";
import { Logger } from "./logger";
import TelegramBot from "node-telegram-bot-api";

export type User = {
    chatId: number;
    firstName: string;
    lastName: string | null;
    username: string | null;
    whitelisted: boolean;
};

export type Group = {
    chatId: number;
    name: string;
    whitelisted: boolean;
};


export class ChatMemory {
    public static async hasContext(chatId: number): Promise<boolean> {
        Logger.debug(`Start hasContext chatId: ${chatId}`);

        const db = Database.instance();
        const result = await db.chat.findUnique({
            select: {
                chatId: true
            },
            where: {
                chatId: chatId
            }
        });

        Logger.debug(`Finish hasContext chatId: ${chatId}`);
        return result ? true : false;
    }

    static async getContext(chatId: number): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
        Logger.debug(`Start getContext chatId: ${chatId}`);

        const db = Database.instance();
        const result = await db.messages.findMany({
            where: {
                chatId: chatId
            },
            select: {
                content: true,
                role: true
            },
            orderBy: {
                datetime: "asc"
            }
        });

        Logger.debug(`Finish getContext chatId: ${chatId}`);

        return result.map((entry) => {
            if (entry.role === "system") {
                return {
                    content: entry.content,
                    role: entry.role,
                } as ChatCompletionSystemMessageParam;
            }

            if (entry.role === "user") {
                return {
                    content: entry.content,
                    role: entry.role,
                } as ChatCompletionUserMessageParam;
            }

            if (entry.role === "assistant") {
                return {
                    content: entry.content,
                    role: entry.role,
                } as ChatCompletionAssistantMessageParam;
            }

            throw new Error("Invalid role");
        });
    }

    static async deleteContext(chatId: number): Promise<void> {
        Logger.debug(`Start deleteContext chatId: ${chatId}`);

        const db = Database.instance();
        await db.messages.deleteMany({
            where: {
                chatId: chatId
            }
        });

        Logger.debug(`Finish deleteContext chatId: ${chatId}`);
    }

    static async addMessage(chatId: number, role: "user" | "assistant" | "system", content: string): Promise<void> {
        Logger.debug(`Start addMessage chatId: ${chatId}`);
        const db = Database.instance();
        await db.messages.create({
            data: {
                chatId: chatId,
                role,
                content
            }
        });
        Logger.debug(`Finish addMessage chatId: ${chatId}`);
    }

    static async getUserInfo(chatId: number): Promise<User> {
        Logger.debug(`Start getUserInfo chatId: ${chatId}`);

        const db = Database.instance();
        const result = await db.user.findUniqueOrThrow({
            select: {
                firstName: true,
                lastName: true,
                username: true,
                whitelisted: true,
                chatId: true
            },
            where: {
                chatId: chatId
            }
        });

        Logger.debug(`Finish getUserInfo chatId: ${chatId}`);
        return {
            ...result,
            chatId: Number(result.chatId),
        };
    }

    static async upsertUserInfo(from: TelegramBot.User): Promise<User> {
        const { first_name, last_name, username, id } = from;
        Logger.debug(`Start upsertUserInfo chatId: ${id}`);

        const db = Database.instance();
        await db.user.upsert({
            where: {
                chatId: id
            },
            update: {
                firstName: first_name,
                lastName: last_name,
                username
            },
            create: {
                chatId: id,
                firstName: first_name,
                lastName: last_name,
                username
            }
        });
        Logger.debug(`Finish upsertUserInfo chatId: ${id}`);
        return ChatMemory.getUserInfo(id);
    }

    static async upsertGroupInfo(chat: TelegramBot.Chat): Promise<Group> {
        const { id, title } = chat;
        Logger.debug(`Start upsertGroupInfo chatId: ${id}`);
        const db = Database.instance();
        await db.group.upsert({
            where: {
                chatId: id
            },
            update: {
                name: title
            },
            create: {
                chatId: id,
                name: title ?? "Group Chat"
            }
        });
        Logger.debug(`Finish upsertGroupInfo chatId: ${id}`);
        return ChatMemory.getGroupInfo(id);
    }

    static async getGroupInfo(chatId: number) {
        Logger.debug(`Start getGroupInfo chatId: ${chatId}`);
        const db = Database.instance();
        const result = await db.group.findUniqueOrThrow({
            select: {
                whitelisted: true,
                chatId: true,
                name: true
            },
            where: {
                chatId: chatId
            }
        });

        Logger.debug(`Finish getGroupInfo chatId: ${chatId}`);
        return {
            ...result,
            chatId: Number(result.chatId),
        };
    }

    static async storePerUserValue<T>(chatId: number, prop: string, value: T): Promise<void> {
        Logger.debug(`Start storePerUserValue chatId: ${chatId}, prop: ${prop}, value: ${value}`);
        const db = Database.instance();
        if (prop === "voice-settings") {
            await db.user.update({
                where: {
                    chatId
                },
                data: {
                    voice: value as string
                }
            });
        }

        if (prop === "custom-bot-name") {
            await db.user.update({
                where: {
                    chatId
                },
                data: {
                    botName: value as string
                }
            });
        }

        if (prop === "custom-name") {
            await db.user.update({
                where: {
                    chatId
                },
                data: {
                    preferredName: value as string
                }
            });
        }

        Logger.debug(`Finish storePerUserValue chatId: ${chatId}`);
    }

    static async getPerUserValue<T>(chatId: number, prop: string): Promise<T | undefined> {
        Logger.debug(`Start getPerUserValue chatId: ${chatId}`);

        const db = Database.instance();
        const result = await db.user.findUnique({
            where: {
                chatId
            },
            select: {
                voice: true,
                botName: true,
                preferredName: true
            }
        });

        if (!result) {
            Logger.debug(`Finish getPerUserValue chatId: ${chatId}`);
            return undefined;
        }

        Logger.debug(`Finish getPerUserValue chatId: ${chatId}`);
        if (prop === "voice-settings") {
            return result.voice as unknown as T;
        }

        if (prop === "custom-bot-name") {
            return result.botName as unknown as T;
        }

        if (prop === "custom-name") {
            return result.preferredName as unknown as T;
        }
    }

    static async hasPerUserValue(chatId: number, prop: string): Promise<boolean> {
        Logger.debug(`Start hasPerUserValue chatId: ${chatId}`);
        const result = await ChatMemory.getPerUserValue<string>(chatId, prop);
        Logger.debug(`Finish hasPerUserValue chatId: ${chatId}`);
        return result ? true : false;
    }


    static async storeSystemValue<T>(prop: string, value: T): Promise<void> {
        const db = Database.instance();
        await db.systemSettings.upsert({
            where: {
                key: prop
            },
            update: {
                value: JSON.stringify(value)
            },
            create: {
                key: prop,
                value: JSON.stringify(value)
            }
        });
    }

    static async getSystemValue<T>(prop: string): Promise<T | undefined> {
        const db = Database.instance();
        const result = await db.systemSettings.findUnique({
            select: {
                value: true
            },
            where: {
                key: prop
            }
        });

        if (!result) {
            return undefined;
        }

        return JSON.parse(result.value) as T;
    }

    static async hasSystemValue(prop: string): Promise<boolean> {
        const db = Database.instance();
        const result = await db.systemSettings.findUnique({
            select: {
                value: true
            },
            where: {
                key: prop
            }
        });

        return result ? true : false;
    }
}
