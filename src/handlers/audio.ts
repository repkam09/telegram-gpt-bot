import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage } from "./text/common";

export function listen() {
    BotInstance.instance().on("audio", handleAudio);
}

async function handleAudio(msg: TelegramBot.Message) {
    if (msg.chat.type !== "private" || !msg.from || !msg.audio) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (!user.whitelisted) {
        return sendMessageWrapper(user.chatId, NotWhitelistedMessage);
    }

    await sendMessageWrapper(user.chatId, "Error: Audio messages are not yet supported");
}
