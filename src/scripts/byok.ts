
import { Logger } from "../singletons/logger";
import { Database } from "../database";

async function run(userId: string, apiKey: string) {
    await Database.init();
    const db = await Database.instance();
    await db.userBYOK.upsert({
        where: {
            chatId: Number(userId)
        },
        update: {
            key: apiKey
        },
        create: {
            chatId: Number(userId),
            key: apiKey
        }
    });
    console.log(`BYOK key for user ${userId} has been updated.`);
}


// Usage: node build/scripts/byok.js [userId] [apiKey]

const userId = process.argv[2];
const apiKey = process.argv[3];

if (!userId || !apiKey) {
    console.error("Usage: node build/scripts/byok.js [userId] [apiKey]");
    process.exit(1);
}

run(userId, apiKey).catch((err) => {
    Logger.error(undefined, `Error occurred: ${err.message}`);
    process.exit(1);
});