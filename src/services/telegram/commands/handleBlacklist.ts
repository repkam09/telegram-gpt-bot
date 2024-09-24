import { TelegramBotInstance } from "../telegram";
import { Database } from "../../../singletons/sqlite";
import { HennosUser } from "../../../singletons/user";
import { HennosConsumer } from "../../../singletons/base";

export async function handleBlacklistCommand(user: HennosUser, text: string) {
    const trimmed = text.replace("/blacklist", "").trim();
    const bot = TelegramBotInstance.instance();
    const db = Database.instance();

    if (trimmed) {
        const input = parseInt(trimmed);
        if (isNaN(input)) {
            return bot.sendMessage(user.chatId, "The chatId you tried to blacklist appears to be invalid. Expected an integer value.");
        }

        // Check if we have this chatId on the blacklist.
        const blacklisted = await HennosConsumer.isBlacklisted(input);
        if (blacklisted) {
            return bot.sendMessage(user.chatId, `ChatId ${input} was already blacklisted at ${blacklisted.datetime.toISOString()}`);
        }

        await db.blacklist.create({
            data: {
                chatId: input,
                datetime: new Date()
            }
        });

        return bot.sendMessage(user.chatId, `ChatId ${input} has been blacklisted.`);
    }

    // Get a list of all the blacklisted users
    const blacklistedUsers = await db.blacklist.findMany({
        select: {
            chatId: true,
            datetime: true
        }
    });

    if (blacklistedUsers.length === 0) {
        return bot.sendMessage(user.chatId, "There are currently no blacklisted users.");
    }

    const message = blacklistedUsers.map(u => `${u.chatId} - ${u.datetime}`).join("\n");
    return bot.sendMessage(user.chatId, `Blacklisted ChatIds:\n${message}`);
}
