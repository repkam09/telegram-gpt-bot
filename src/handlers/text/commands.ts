import TelegramBot, { CallbackQuery } from "node-telegram-bot-api";
import { sendMessageWrapper } from "../../utils";
import { handleVoiceReadCommand, handleVoiceSettingsCallback } from "./commands/handleVoiceSettings";
import { handleGeneralSettingsCallback, handleGeneralSettingsCommand } from "./commands/handleGeneralSettings";
import { handleWhitelistCommand } from "./commands/handleWhitelist";
import { handleHelpCommand, handleResetCommand, handleStartCommand } from "./commands/basic";
import { isAdmin } from "./common";
import { ChatMemory } from "../../singletons/memory";

export async function handleCommandMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.chat.type !== "private") {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (msg.text === "/reset") {
        return handleResetCommand(user);
    }

    if (msg.text === "/start") {
        return handleStartCommand(user);
    }

    if (msg.text === "/help" || msg.text === "/about") {
        return handleHelpCommand(user);
    }

    if (msg.text === "/settings" && user.whitelisted) {
        return handleGeneralSettingsCommand(user);
    }

    if (msg.text.startsWith("/read") && user.whitelisted) {
        return handleVoiceReadCommand(user, msg.text);
    }

    if (msg.text.startsWith("/whitelist") && isAdmin(msg.chat.id)) {
        return handleWhitelistCommand(user, msg.text);
    }

    return sendMessageWrapper(user.chatId, "Unknown Command");
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
