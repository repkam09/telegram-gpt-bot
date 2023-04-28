import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("document", handleDocument);
}

async function handleDocument(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.document) {
        return;
    }

    await sendMessageWrapper(chatId, "Error: Documents and Files are not yet supported.");
}
