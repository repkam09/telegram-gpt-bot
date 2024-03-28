import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage, processUserImageInput, updateChatContext } from "./text/common";

export function listen() {
    BotInstance.instance().on("photo", handlePhoto);
}

async function handlePhoto(msg: TelegramBot.Message) {
    if (msg.chat.type !== "private" || !msg.from || !msg.photo) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (!user.whitelisted) {
        return sendMessageWrapper(user.chatId, NotWhitelistedMessage);
    }

    const message = await processUserImageInput(user.chatId, msg.photo, msg.caption);
    if (!msg.caption) {
        await updateChatContext(user.chatId, "system", `The user sent an image. Here is a description of the image: ${message}`);
    } else {
        await updateChatContext(user.chatId, "system", "The user sent an image.");
        await updateChatContext(user.chatId, "user", msg.caption);
        await updateChatContext(user.chatId, "assistant", message);
    }
    await sendMessageWrapper(user.chatId, message);
}
