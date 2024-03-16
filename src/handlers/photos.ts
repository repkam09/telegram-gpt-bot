import { Logger } from "../singletons/logger";
import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { isOnBlacklist, isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage, processUserImageInput, updateChatContext } from "./text/common";

export function listen() {
    BotInstance.instance().on("photo", handlePhoto);
}

async function handlePhoto(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.photo) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("photo_private", msg);

    const { first_name, last_name, username, id } = msg.from;
    await ChatMemory.upsertUserInfo(id, first_name, last_name, username);

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, NotWhitelistedMessage);
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
