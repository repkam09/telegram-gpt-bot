import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";

async function main() {
    const redis = createClient();
    const prisma = new PrismaClient();
    await redis.connect();


    const keys = await redis.keys("hennos:*");
    const users = keys.map((key) => {
        const split = key.split(":");
        return parseInt(split[1]);
    });

    // loop over all the users importing their data
    const promises = users.map(async (chatId) => {
        if (chatId < 0) {
            console.log(`Ignoring group id ${chatId}`);
            return;
        }

        console.log(`Importing data for ${chatId}`);
        const stringNameRecord = await redis.get(`hennos:${chatId}:name`);
        if (!stringNameRecord) {
            console.log(`No name for ${chatId}`);
            return;
        }

        await prisma.user.upsert({
            where: {
                id: chatId
            },
            create: {
                id: chatId,
                name: "unknown",
                botName: "Hennos",
                voice: "shimmer"
            },
            update: {

            }
        });

        const nameRecord = JSON.parse(stringNameRecord) as { name: string };
        const firstName = nameRecord.name.split(" ")[0];
        await prisma.user.update({
            where: {
                id: chatId
            },
            data: {
                name: firstName
            }
        });

        const stringCustomNameRecord = await redis.get(`hennos:${chatId}:custom-name`);
        if (stringCustomNameRecord) {
            const customNameRecord = JSON.parse(stringCustomNameRecord) as { name: string };
            await prisma.user.update({
                where: {
                    id: chatId
                },
                data: {
                    name: customNameRecord.name
                }
            });
        }

        const stringVoiceRecord = await redis.get(`hennos:${chatId}:voice`);
        if (stringVoiceRecord) {
            const voiceRecord = JSON.parse(stringVoiceRecord) as { voice: string };
            await prisma.user.update({
                where: {
                    id: chatId
                },
                data: {
                    voice: voiceRecord.voice
                }
            });
        }

        const stringBotNameRecord = await redis.get(`hennos:${chatId}:bot-name`);
        if (stringBotNameRecord) {
            const botNameRecord = JSON.parse(stringBotNameRecord) as { botName: string };
            await prisma.user.update({
                where: {
                    id: chatId
                },
                data: {
                    botName: botNameRecord.botName
                }
            });
        }

        const messages = await redis.get(`hennos:${chatId}:context`);
        if (messages) {
            console.log("importing messages for ", chatId);

            const parsedMessages = JSON.parse(messages) as { role: "system" | "user" | "assistant" | "function", content: string }[];
            const prismaMessages = parsedMessages.map((message) => ({
                userId: chatId,
                role: message.role,
                content: message.content as string
            })).filter((message) => message.role != "function");

            await prisma.message.createMany({
                data: prismaMessages as { role: "system" | "user" | "assistant", content: string, userId: number }[]
            });
        }
    });

    await Promise.all(promises);
    console.log("Done");
    await redis.disconnect();
}


main();