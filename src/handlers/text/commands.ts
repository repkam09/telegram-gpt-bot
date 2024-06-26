import TelegramBot from "node-telegram-bot-api";
import { handleGeneralSettingsCommand } from "./commands/handleGeneralSettings";
import { handleWhitelistCommand } from "./commands/handleWhitelist";
import { handleHelpCommand, handleResetCommand, handleStartCommand } from "./commands/basic";
import { BotInstance } from "../../singletons/telegram";
import { HennosUser } from "../../singletons/user";
import { handleAdminSetProviderCommand } from "./commands/handleLLMProviderSettings";

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

    if (msg.text.startsWith("/whitelist") && user.isAdmin()) {
        return handleWhitelistCommand(user, msg.text);
    }

    if (msg.text.startsWith("/llm-provider") && user.isAdmin()) {
        return handleAdminSetProviderCommand(user, msg.text);
    }

    return BotInstance.sendMessageWrapper(user, "Unknown Command");
}
