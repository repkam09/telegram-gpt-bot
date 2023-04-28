import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("photo", handlePhoto);
}

async function handlePhoto(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.photo) {
        return;
    }

    await sendMessageWrapper(chatId, "Error: Images are not yet supported.");
}
