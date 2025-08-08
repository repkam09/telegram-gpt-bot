import { TelegramBotInstance } from "../telegram";
import { Database } from "../../../singletons/sqlite";
import { HennosGroup, HennosUser } from "../../../singletons/consumer";

export async function handleWhitelistCommand(user: HennosUser, text: string) {
    const trimmed = text.replace("/whitelist", "").trim();
    const bot = TelegramBotInstance.instance();
    const db = Database.instance();

    if (trimmed) {
        const input = parseInt(trimmed);
        if (isNaN(input)) {
            return bot.sendMessage(user.chatId, "The chatId you tried to whitelist appears to be invalid. Expected an integer value.");
        }

        // Check if we have a user with that chatId.
        const exists = await HennosUser.exists(input);
        if (!exists) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is not a known user.`);
        }

        if (exists.whitelisted) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is already whitelisted.`);
        }

        await exists.setWhitelisted(true);
        return bot.sendMessage(user.chatId, `ChatId ${input} has been whitelisted.`);
    }

    // Get a list of all the whitelisted users
    const whitelistedUsers = await db.user.findMany({
        select: {
            chatId: true,
            firstName: true,
        },
        where: {
            whitelisted: true
        }
    });

    if (whitelistedUsers.length === 0) {
        return bot.sendMessage(user.chatId, "There are currently no whitelisted users.");
    }

    const message = whitelistedUsers.map(u => `${u.chatId} - ${u.firstName}`).join("\n");
    return bot.sendMessage(user.chatId, `Whitelisted Users:\n${message}`);
}


export async function handleWhitelistGroupCommand(user: HennosUser, text: string) {
    const trimmed = text.replace("/whitelist-group", "").trim();
    const bot = TelegramBotInstance.instance();
    const db = Database.instance();

    if (trimmed) {
        const input = parseInt(trimmed);
        if (isNaN(input)) {
            return bot.sendMessage(user.chatId, "The chatId you tried to whitelist appears to be invalid. Expected an integer value.");
        }

        // Check if we have a user with that chatId.
        const group = await HennosGroup.exists(input);
        if (!group) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is not a known group.`);
        }

        if (group.whitelisted) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is already whitelisted.`);
        }

        await group.setWhitelisted(true);
        return bot.sendMessage(user.chatId, `ChatId ${input} has been whitelisted.`);
    }

    // Get a list of all the whitelisted groups
    const whitelistedGroups = await db.group.findMany({
        select: {
            chatId: true,
            name: true,
        },
        where: {
            whitelisted: true
        }
    });

    if (whitelistedGroups.length === 0) {
        return bot.sendMessage(user.chatId, "There are currently no whitelisted groups.");
    }

    const message = whitelistedGroups.map(g => `${g.chatId} - ${g.name}`).join("\n");
    return bot.sendMessage(user.chatId, `Whitelisted Groups:\n${message}`);
}
