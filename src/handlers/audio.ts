import { Logger } from "../singletons/logger";
import { BotInstance } from "../singletons/telegram";
import { isOnBlacklist, isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage } from "./text/common";
import { Database } from "../singletons/prisma";

export function listen() {
    BotInstance.instance().on("audio", handleAudio);
}

async function handleAudio(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.audio) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("audio", msg);

    const { first_name, last_name, username, id } = msg.from;
    await Database.upsertUser(chatId, msg.from.first_name);


    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, NotWhitelistedMessage);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await sendMessageWrapper(chatId, "Error: Audio messages are not yet supported");
}
