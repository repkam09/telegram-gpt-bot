import { createClient } from "redis";
import dotenv from "dotenv";
import { Database } from "../singletons/sqlite";

dotenv.config();

if (!process.env.HENNOS_REDIS_HOST) {
    throw new Error("Missing HENNOS_REDIS_HOST");
}

if (!process.env.HENNOS_REDIS_PORT) {
    throw new Error("Missing HENNOS_REDIS_PORT");
}

// Create a Redis client
const client = createClient({
    url: `redis://${process.env.HENNOS_REDIS_HOST}:${process.env.HENNOS_REDIS_PORT}`
});

async function database() {
    await Database.init();
    await client.connect();

    const db = Database.instance();

    // Grab all the keys with the prefix 'hennos'
    const result = await client.keys("hennos:*");
    for (const key of result) {
        const parts = key.split(":");
        const id = parts[1].trim();
        const type = parts[2].trim();

        console.log(`Importing ${type} for ${id}`);

        if (type === "context") {
            await handleContextImport(id, key);
        }

        if (type === "name") {
            await handleNameImport(id, key);
        }
    }

    for (const key of result) {
        const parts = key.split(":");
        const id = parts[1].trim();
        const type = parts[2].trim();

        if (type === "custom-bot-name") {
            const chatId = parseInt(id);
            const rawBotName = await client.get(key) as string;
            const botName = JSON.parse(rawBotName);
            try {
                await db.user.update({
                    where: {
                        chatId,
                    },
                    data: {
                        botName: botName
                    }
                });
            } catch (err) {
                console.error(err);
            }
        }

        if (type === "custom-name") {
            const chatId = parseInt(id);
            const rawCustomName = await client.get(key) as string;
            const customName = JSON.parse(rawCustomName);
            try {
                await db.user.update({
                    where: {
                        chatId,
                    },
                    data: {
                        preferredName: customName
                    }
                });
            } catch (e) {
                console.error(e);
            }
        }

        if (type === "voice-settings") {
            const chatId = parseInt(id);
            const rawVoice = await client.get(key) as string;
            const voice = JSON.parse(rawVoice);
            try {
                await db.user.update({
                    where: {
                        chatId,
                    },
                    data: {
                        voice: voice
                    }
                });
            } catch (e) {
                console.error(e);
            }
        }
    }

    await handleWhitelistImport("hennos:system_value:whitelist");
    await client.disconnect();
}

async function handleContextImport(id: string, key: string) {
    const db = Database.instance();
    const chatId = parseInt(id);

    const value = await client.get(key) as string;
    const parsed = JSON.parse(value) as { role: string, content: string }[];

    // Delete any existing messages for this chatId
    await db.messages.deleteMany({
        where: {
            chatId
        }
    });

    for (const message of parsed) {
        await db.messages.create({
            data: {
                chatId,
                role: message.role,
                content: message.content
            }
        });
    }
}

async function handleWhitelistImport(key: string) {
    const db = Database.instance();

    const value = await client.get(key) as string;
    const parsed = JSON.parse(value) as number[];

    for (const chatId of parsed) {
        if (chatId > 0) {
            const exists = await db.user.findUnique({
                where: {
                    chatId
                }
            });
            if (exists) {
                await db.user.update({
                    where: {
                        chatId
                    },
                    data: {
                        whitelisted: true
                    }
                });
            }
        }

        if (chatId < 0) {
            const exists = await db.group.findUnique({
                where: {
                    chatId
                }
            });
            if (exists) {
                await db.group.update({
                    where: {
                        chatId
                    },
                    data: {
                        whitelisted: true
                    }
                });
            }
        }
    }
}

async function handleNameImport(id: string, key: string) {
    const db = Database.instance();
    const chatId = parseInt(id);
    if (isNaN(chatId)) {
        throw new Error(`Invalid chat ID: ${id}`);
    }

    const value = await client.get(key) as string;
    if (chatId > 0) {
        const parsed = JSON.parse(value);
        const parts = parsed.name.split(" ") as string[];

        if (parts.length < 4) {
            throw new Error(`Invalid name: ${parsed.name}`);
        }

        const reversed = parts.reverse();

        const rawUserId = reversed.shift() as string;
        const userId = parseInt(rawUserId.substring(1, rawUserId.length - 1));

        if (userId !== chatId) {
            throw new Error(`User ID mismatch: ${userId} !== ${chatId}`);
        }

        const rawUsername = reversed.shift() as string;
        let username: string | undefined = rawUsername.substring(1, rawUsername.length - 1);
        if (username === "undefined") {
            username = undefined;
        }

        let lastName = reversed.shift();
        if (lastName === "undefined") {
            lastName = undefined;
        }

        const firstName = reversed.join(" ");
        await db.user.upsert({
            where: {
                chatId
            },
            create: {
                chatId,
                username,
                firstName,
                lastName,
                whitelisted: false
            },
            update: {
                username,
                firstName,
                lastName
            }
        });
    }

    if (chatId < 0) {
        const parsed = JSON.parse(value);
        const name = parsed.name;
        const parts = name.split(" ") as string[];
        const reversed = parts.reverse();
        const rawGroupId = reversed.shift() as string;
        const groupId = parseInt(rawGroupId.substring(1, rawGroupId.length - 1));

        const chatName = reversed.join(" ");

        if (groupId !== chatId) {
            throw new Error(`Chat ID mismatch: ${groupId} !== ${chatId}`);
        }

        await db.group.upsert({
            where: {
                chatId
            },
            create: {
                chatId,
                name: chatName,
                whitelisted: false
            },
            update: {
                name: chatName
            }
        });
    }

}


// Kick off the async function
database();