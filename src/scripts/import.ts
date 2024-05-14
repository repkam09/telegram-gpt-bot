/* eslint-disable @typescript-eslint/no-unused-vars */
import { createClient } from "redis";
import dotenv from "dotenv";
import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";
import { HennosGroup } from "../singletons/group";
import { Logger } from "../singletons/logger";

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

    // Grab all the keys with the prefix 'hennos'
    const result = await client.keys("hennos:*");

    // Do all the Group and User imports first
    for (const key of result) {
        const [_, id, type] = key.split(":").map((part) => part.trim());
        if (type === "name") {
            await handleNameImport(id, key);
        }
    }

    // Next, import all the messages and chat context
    for (const key of result) {
        const [_, id, type] = key.split(":").map((part) => part.trim());
        if (type === "context") {
            await handleContextImport(id, key);
        }
    }

    // Import all the custom user preferences
    for (const key of result) {
        const [_, id, type] = key.split(":").map((part) => part.trim());

        if (type === "custom-bot-name") {
            const raw = await client.get(key) as string;
            const user = await HennosUser.exists(parseInt(id));
            if (!user) {
                throw new Error(`User does not exist: ${id}`);
            }

            Logger.log(`${id} setPreferredBotName ${raw}`);
            await user.setPreferredBotName(JSON.parse(raw));
        }

        if (type === "custom-name") {
            const raw = await client.get(key) as string;
            const user = await HennosUser.exists(parseInt(id));
            if (!user) {
                throw new Error(`User does not exist: ${id}`);
            }

            Logger.log(`${id} setPreferredName ${raw}`);
            await user.setPreferredName(JSON.parse(raw));
        }

        if (type === "voice-settings") {
            const raw = await client.get(key) as string;
            const user = await HennosUser.exists(parseInt(id));
            if (!user) {
                throw new Error(`User does not exist: ${id}`);
            }

            Logger.log(`${id} setPreferredVoice ${raw}`);
            await user.setPreferredVoice(JSON.parse(raw));
        }
    }

    // Import the whitelist into the user and groups 
    await handleWhitelistImport("hennos:system_value:whitelist");

    // Quit!
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

    const raw = await client.get(key) as string;
    const parsed = JSON.parse(raw) as number[];

    for (const chatId of parsed) {
        if (chatId > 0) {
            const user = await HennosUser.exists(chatId);
            if (user) {
                Logger.log(`User ${chatId} setWhitelisted true`);
                await HennosUser.setWhitelisted(user, true);
            }
        }

        if (chatId < 0) {
            const exists = await db.group.findUnique({
                where: {
                    chatId
                }
            });
            if (exists) {
                Logger.log(`Group ${chatId} setWhitelisted true`);
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

        const user = new HennosUser(chatId);
        Logger.log("Creating User: ", chatId, firstName, lastName, username);
        await user.setBasicInfo(firstName, lastName, username);
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

        const group = new HennosGroup(chatId);
        Logger.log("Creating Group: ", chatId, chatName);
        await group.setBasicInfo(chatName);
    }

}


// Kick off the async function
database();