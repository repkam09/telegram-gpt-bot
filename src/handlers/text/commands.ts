import TelegramBot, { CallbackQuery } from "node-telegram-bot-api";
import { isOnBlacklist, isOnWhitelist, sendMessageWrapper } from "../../utils";
import { Logger } from "../../singletons/logger";
import { handleVoiceReadCommand, handleVoiceSettingsCallback } from "./commands/handleVoiceSettings";
import { handleGeneralSettingsCallback, handleGeneralSettingsCommand } from "./commands/handleGeneralSettings";
import { handleHelpCommand, handleResetCommand, handleStartCommand } from "./commands/basic";

type MessageWithText = TelegramBot.Message & { text: string }

export function handleCommandMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.chat.type !== "private") {
        return;
    }

    if (isOnBlacklist(msg.chat.id)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("text_command", msg);

    if (msg.text === "/reset") {
        return handleResetCommand(msg as MessageWithText);
    }

    if (msg.text === "/start") {
        return handleStartCommand(msg as MessageWithText);
    }

    if (msg.text === "/help" || msg.text === "/about") {
        return handleHelpCommand(msg as MessageWithText);
    }

    if (msg.text.startsWith("/read") && isOnWhitelist(msg.chat.id)) {
        return handleVoiceReadCommand(msg as MessageWithText);
    }

    if (msg.text.startsWith("/settings") && isOnWhitelist(msg.chat.id)) {
        return handleGeneralSettingsCommand(msg as MessageWithText);
    }

    return sendMessageWrapper(msg.chat.id, "Unknown Command");
}

export async function handleCommandMessageCallback(query: CallbackQuery) {
    if (!query.data) {
        return;
    }

    if (query.data.startsWith("voice-settings-")) {
        return handleVoiceSettingsCallback(query.from.id, query.id, query.data);
    }

    if (query.data.startsWith("customize-")) {
        return handleGeneralSettingsCallback(query.from.id, query.id, query.data);
    }
}
