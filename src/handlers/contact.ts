import { BotInstance } from "../singletons/telegram";
import {  sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../singletons/memory";
import { NotWhitelistedMessage } from "./text/common";

export function listen() {
    BotInstance.instance().on("contact", handleContact);
}

async function handleContact(msg: TelegramBot.Message) {
    if (msg.chat.type !== "private" || !msg.from || !msg.contact) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (!user.whitelisted) {
        return sendMessageWrapper(user.chatId, NotWhitelistedMessage);
    }

    await sendMessageWrapper(user.chatId, "Error: Contacts are not supported yet.");
}
