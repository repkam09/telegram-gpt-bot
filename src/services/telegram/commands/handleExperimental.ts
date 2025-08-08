import { TelegramBotInstance } from "../telegram";
import { Database } from "../../../singletons/sqlite";
import { HennosUser } from "../../../singletons/consumer";

export async function handleExperimentalCommand(user: HennosUser, text: string) {
    const trimmed = text.replace("/experimental", "").trim();
    const bot = TelegramBotInstance.instance();
    const db = Database.instance();

    if (trimmed) {
        const input = parseInt(trimmed);
        if (isNaN(input)) {
            return bot.sendMessage(user.chatId, "The chatId you tried to modify appears to be invalid. Expected an integer value.");
        }

        // Check if we have a user with that chatId.
        const exists = await HennosUser.exists(input);
        if (!exists) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is not a known user.`);
        }

        if (exists.experimental) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is already enabled for experimental features.`);
        }

        await exists.setExperimental(true);
        return bot.sendMessage(user.chatId, `ChatId ${input} has been enabled for experimental features.`);
    }

    // Get a list of all the experimental users
    const experimentalUsers = await db.user.findMany({
        select: {
            chatId: true,
            firstName: true,
        },
        where: {
            experimental: true
        }
    });

    if (experimentalUsers.length === 0) {
        return bot.sendMessage(user.chatId, "There are currently no users set to use experimental features.");
    }

    const message = experimentalUsers.map(u => `${u.chatId} - ${u.firstName}`).join("\n");
    return bot.sendMessage(user.chatId, `Experimental users:\n${message}`);
}
