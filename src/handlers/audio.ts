import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("audio", handleAudio);
}

async function handleAudio(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.audio) {
        return;
    }

    await sendMessageWrapper(chatId, "Error: Audio messages are not yet supported");
}
