import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { updateChatContext } from "./text/common";
import { ChatMemory } from "../singletons/memory";
import { Logger } from "../singletons/logger";

export function listen() {
    BotInstance.instance().on("location", handleLocation);
}

async function handleLocation(msg: TelegramBot.Message) {
    Logger.trace("location", msg);

    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.location) {
        return;
    }

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await updateChatContext(chatId, "user", `Here is my location as of '${new Date().toUTCString()}': lat=${msg.location.latitude}, lon=${msg.location.longitude}`);
    await sendMessageWrapper(chatId, `Success! Your provided location will be taken into account, if relevant, in future messages.\n\n Information: ${JSON.stringify(msg.location)}.`);
}
