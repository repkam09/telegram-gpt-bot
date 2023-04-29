import { Config } from "./singletons/config";
import { BotInstance } from "./singletons/telegram";
import { ChatMemory } from "./singletons/memory";
import { Logger } from "./singletons/logger";
import TelegramBot from "node-telegram-bot-api";

export async function sendMessageWrapper(chatId: number, content: string, options: TelegramBot.SendMessageOptions = {}) {
    if (!content) {
        throw new Error("Message content is undefined");
    }

    if (!content.length) {
        throw new Error("Message content does not have a length property");
    }

    if (content.length < 4096) {
        return await BotInstance.instance().sendMessage(chatId, content, options);
    }

    const chunks = chunkSubstr(content, 4096);
    for (let i = 0; i < chunks.length; i++) {
        await BotInstance.instance().sendMessage(chatId, chunks[i], options);
    }
}

export async function sendAdminMessage(content: string) {
    Logger.info("Notice: " + content);

    if (Config.TELEGRAM_BOT_ADMIN !== -1 && !Config.HENNOS_DEVELOPMENT_MODE) {
        await BotInstance.instance().sendMessage(Config.TELEGRAM_BOT_ADMIN, content, {});
    }
}

function chunkSubstr(str: string, size: number) {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);

    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }

    return chunks;
}

export async function resetMemory(chatId: number): Promise<void> {
    await ChatMemory.deleteContext(chatId);
}

export function isOnWhitelist(id: number) {
    if (!Config.TELEGRAM_ID_WHITELIST) {
        return true;
    }

    return Config.TELEGRAM_ID_WHITELIST.includes(id);
}

export class NotImplementedError extends Error {
    constructor(...optionalParams: unknown[]) {
        super("Not Implemented");
        console.log(optionalParams);
    }
}
