import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper, updateChatContext } from "../utils";
import TelegramBot from "node-telegram-bot-api";

export function listen() {
    BotInstance.instance().on("location", handleLocation);
}

async function handleLocation(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.location) {
        return;
    }

    await updateChatContext(chatId, "user", `Here is my location as of '${new Date().toUTCString()}': lat=${msg.location.latitude}, lon=${msg.location.longitude}`, msg.from.first_name);
    await sendMessageWrapper(chatId, `Success! Your provided location will be taken into account, if relevant, in future messages.\n\n Information: ${JSON.stringify(msg.location)}.`);
}
