import TelegramBot from "node-telegram-bot-api";
import { handleGeneralSettingsCommand } from "./commands/handleGeneralSettings";
import { handleWhitelistCommand, handleWhitelistGroupCommand } from "./commands/handleWhitelist";
import { handleHelpCommand, handleResetCommand, handleStartCommand } from "./commands/basic";
import { TelegramBotInstance } from "./telegram";
import { HennosUser } from "../../singletons/user";
import { handleAdminSetProviderCommand } from "./commands/handleLLMProviderSettings";
import { handleReadCommand } from "./commands/handleVoiceSettings";
import { handleExperimentalCommand } from "./commands/handleExperimental";
import { HennosGroup } from "../../singletons/group";
import { handleBlacklistCommand } from "./commands/handleBlacklist";
import { handleCreateHennosLink } from "./commands/handleHennosLink";

export async function handleCommandGroupMessage(user: HennosUser, group: HennosGroup, msg: string) {
    if (msg === "/reset") {
        return handleResetCommand(group);
    }

    if (msg === "/start") {
        return handleStartCommand(group);
    }

    if (msg === "/help" || msg === "/about") {
        return handleHelpCommand(group);
    }

    if (msg === "/settings" && user.whitelisted) {
        return TelegramBotInstance.sendMessageWrapper(group, "Settings are not available in group chats.");
    }

    return TelegramBotInstance.sendMessageWrapper(group, "Unknown Command");
}

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


    if (msg.text === "/link" && user.whitelisted) {
        return handleCreateHennosLink(user);
    }

    if (msg.text.startsWith("/read ") && user.whitelisted) {
        return handleReadCommand(user, msg.text);
    }

    if (msg.text.startsWith("/whitelist-group") && user.isAdmin()) {
        return handleWhitelistGroupCommand(user, msg.text);
    }

    if (msg.text.startsWith("/whitelist") && user.isAdmin()) {
        return handleWhitelistCommand(user, msg.text);
    }

    if (msg.text.startsWith("/blacklist") && user.isAdmin()) {
        return handleBlacklistCommand(user, msg.text);
    }

    if (msg.text.startsWith("/experimental") && user.isAdmin()) {
        return handleExperimentalCommand(user, msg.text);
    }

    if (msg.text.startsWith("/llm-provider") && user.isAdmin()) {
        return handleAdminSetProviderCommand(user, msg.text);
    }

    return TelegramBotInstance.sendMessageWrapper(user, "Unknown Command");
}
