import { Logger } from "../singletons/logger";
import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("photo", handlePhoto);
}

async function handlePhoto(msg: TelegramBot.Message) {
    Logger.trace("photo", msg);

    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.photo) {
        return;
    }

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await sendMessageWrapper(chatId, "Error: Images are not yet supported.");
}
