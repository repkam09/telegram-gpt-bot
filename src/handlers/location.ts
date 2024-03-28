import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../singletons/memory";
import { NotWhitelistedMessage } from "./text/common";

export function listen() {
    BotInstance.instance().on("location", handleLocation);
}

async function handleLocation(msg: TelegramBot.Message) {
    if (msg.chat.type !== "private" || !msg.from || !msg.location) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (!user.whitelisted) {
        return sendMessageWrapper(user.chatId, NotWhitelistedMessage);
    }

    await ChatMemory.storePerUserValue<string>(user.chatId, "last-known-location", `time=${new Date().toUTCString()} lat=${msg.location.latitude}, lon=${msg.location.longitude}`);
    await sendMessageWrapper(user.chatId, "Thanks! I will take your location into account in the future.");
}
