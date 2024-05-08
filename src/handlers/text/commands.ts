import TelegramBot from "node-telegram-bot-api";
import { handleVoiceReadCommand } from "./commands/handleVoiceSettings";
import { handleGeneralSettingsCommand } from "./commands/handleGeneralSettings";
import { handleWhitelistCommand } from "./commands/handleWhitelist";
import { handleChatPairCommand, handleHelpCommand, handleResetCommand, handleStartCommand } from "./commands/basic";
import { BotInstance } from "../../singletons/telegram";
import { HennosUser } from "../../singletons/user";

export async function handleCommandMessage(user: HennosUser, msg: TelegramBot.Message & { text: string }) {
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

    if (msg.text === "/pair" && user.whitelisted) {
        return handleChatPairCommand(user);
    }

    if (msg.text.startsWith("/read") && user.whitelisted) {
        return handleVoiceReadCommand(user, msg.text);
    }

    if (msg.text.startsWith("/whitelist") && user.isAdmin()) {
        return handleWhitelistCommand(user, msg.text);
    }

    return BotInstance.sendMessageWrapper(user, "Unknown Command");
}
