import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { updateChatContext } from "./text/common";
import { ChatMemory } from "../singletons/memory";
import { Logger } from "../singletons/logger";

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
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await updateChatContext(chatId, "user", `Here is the contact information for '${msg.contact.first_name}'. Phone Number: ${msg.contact.phone_number}`);
    await sendMessageWrapper(chatId, `I have received the information for your provided contact '${msg.contact.first_name}'`);
}
