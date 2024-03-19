import { Logger } from "../singletons/logger";
import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { isOnBlacklist, isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage } from "./text/common";
import fs from "node:fs/promises";
import os from "os";
import { Document } from "llamaindex";
import { Vector } from "../singletons/vector";

export function listen() {
    BotInstance.instance().on("document", handleDocument);
}

async function handleDocument(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.document) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("document", msg);

    const { first_name, last_name, username, id } = msg.from;
    await ChatMemory.upsertUserInfo(id, first_name, last_name, username);


    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, NotWhitelistedMessage);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    await sendMessageWrapper(chatId, `Processing Document: ${msg.document.file_name} (${msg.document.file_size} bytes)`);
    const path = await BotInstance.instance().downloadFile(msg.document.file_id, os.tmpdir());
    const essay = await fs.readFile(path, "utf-8");
    const document = new Document({ text: essay, id_: msg.document.file_unique_id });

    await Vector.instance().docStore.addDocuments([document], false);
    await sendMessageWrapper(chatId, `Finished Processing Document: ${msg.document.file_name}`);

    const query = await Vector.instance().asQueryEngine();
    const response = await query.query({
        query: "What is Llamaindex?"
    });

    await sendMessageWrapper(chatId, `Document Query: ${response.response}`);
}
