import { randomUUID } from "node:crypto";
import { Database } from "../../../singletons/sqlite";
import { HennosUser } from "../../../singletons/user";
import { TelegramBotInstance } from "../telegram";

export async function handleCreateHennosLink(user: HennosUser) {
    const link = randomUUID();

    const db = Database.instance();
    await db.hennosLink.upsert({
        where: {
            chatId: user.chatId
        },
        create: {
            chatId: user.chatId,
            link
        },
        update: {
            link
        }
    });

    return TelegramBotInstance.sendMessageWrapper(user, "Token: `" + link + "`");
}

