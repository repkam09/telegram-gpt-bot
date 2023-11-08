import { Logger } from "../singletons/logger";
import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { processUserImageInput, updateChatContext } from "./text/common";

export function listen() {
    BotInstance.instance().on("photo", handlePhoto);
}

async function handlePhoto(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.photo) {
        return;
    }

    Logger.trace("photo_private", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    const message = await processUserImageInput(chatId, msg.photo, msg.caption);
    if (!msg.caption) {
        await updateChatContext(chatId, "system", `The user sent an image. Here is a description of the image: ${message}`);
    } else {
        await updateChatContext(chatId, "system", "The user sent an image.");
        await updateChatContext(chatId, "user", msg.caption);
        await updateChatContext(chatId, "assistant", message);
    }
    await sendMessageWrapper(chatId, message);
    return;
}
