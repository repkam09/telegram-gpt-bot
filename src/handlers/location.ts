import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../singletons/memory";
import { Logger } from "../singletons/logger";

export function listen() {
    BotInstance.instance().on("location", handleLocation);
}

async function handleLocation(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.location) {
        return;
    }

    Logger.trace("location", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await ChatMemory.storePerUserValue<string>(chatId, "last-known-location", `time=${new Date().toUTCString()} lat=${msg.location.latitude}, lon=${msg.location.longitude}`);
    await sendMessageWrapper(chatId, "Thanks! I will take your location into account in the future.");
}
