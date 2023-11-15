
import os from "node:os";
import fs from "fs";
import { Logger } from "../singletons/logger";
import { BotInstance } from "../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";
import { isOnBlacklist } from "../utils";

export function listen() {
    BotInstance.instance().on("sticker", handleSticker);
}

async function handleSticker(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.sticker) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    const { set_name, emoji } = msg.sticker;
    if (set_name && emoji) {
        return;
    }

    Logger.trace("sticker", msg);

    try {
        const stickerPath = await BotInstance.instance().downloadFile(msg.sticker.file_id, os.tmpdir());
        await BotInstance.instance().sendPhoto(chatId, fs.createReadStream(stickerPath), { reply_to_message_id: msg.message_id, caption: "Here, I RepBig'd that for you!" }, { contentType: "image/webp" });
    } catch (err) {
        Logger.error(err);
    }
}
