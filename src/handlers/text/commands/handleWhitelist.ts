import TelegramBot from "node-telegram-bot-api";
import { BotInstance } from "../../../singletons/telegram";
import { Config } from "../../../singletons/config";

type MessageWithText = TelegramBot.Message & { text: string }

export async function handleWhitelistCommand(msg: MessageWithText) {
    const chatId = msg.chat.id;
    const trimmed = msg.text.replace("/whitelist", "").trim();
    if (trimmed) {
        const bot = BotInstance.instance();
        const input = parseInt(trimmed);
        if (isNaN(input)) {
            bot.sendMessage(chatId, "The chatId you tried to whitelist appears to be invalid. Expected an integer value.");
            return;
        }
        await Config.update_whitelist([input]);
        await bot.sendMessage(chatId, `ChatId ${input} has been whitelisted.`);
    }

    if (Config.TELEGRAM_ID_WHITELIST) {
        const bot = BotInstance.instance();
        await bot.sendMessage(chatId, `The current whitelist is: ${Config.TELEGRAM_ID_WHITELIST.join(", ")}`);
    }
}
