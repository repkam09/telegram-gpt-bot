import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper, updateChatContext } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("contact", handleContact);
}

async function handleContact(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.contact) {
        return;
    }

    await updateChatContext(chatId, "user", `Here is the contact information for '${msg.contact.first_name}'. Phone Number: ${msg.contact.phone_number}`, msg.from.first_name);
    await sendMessageWrapper(chatId, `I have received the information for your provided contact '${msg.contact.first_name}'`);
}
