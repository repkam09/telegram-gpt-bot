import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("voice", handleVoice);
}

async function handleVoice(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.voice) {
        return;
    }
    await sendMessageWrapper(chatId, "Error: Voice recordings are not yet supported.");
}
