import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../singletons/memory";
import { Logger } from "../singletons/logger";
import { NotWhitelistedMessage } from "./text/common";

export function listen() {
    BotInstance.instance().on("contact", handleContact);
}

async function handleContact(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.contact) {
        return;
    }

    Logger.trace("contact", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, NotWhitelistedMessage);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await sendMessageWrapper(chatId, "Error: Contacts are not supported yet.");
}
