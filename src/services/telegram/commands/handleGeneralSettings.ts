import TelegramBot from "node-telegram-bot-api";
import { TelegramBotInstance, registerInputCallback } from "../telegram";
import { sendVoiceSettingsPrompt } from "./handleVoiceSettings";
import { HennosUser } from "../../../singletons/user";
import { sendLLMProviderSettingsPrompt } from "./handleLLMProviderSettings";

export async function handleGeneralSettingsCallback(user: HennosUser, queryId: string, data: string) {
    const bot = TelegramBotInstance.instance();

    // Set the voice and return to the user.
    const command = data.replace("customize-", "").trim();
    if (command === "my-name") {
        bot.answerCallbackQuery(queryId);
        registerInputCallback(user, (msg: TelegramBot.Message) => {
            const name = msg.text as string;
            user.setPreferredName(name);
            bot.sendMessage(user.chatId, "Thanks! I'll call you " + name + " going forward.");
        });
        bot.sendMessage(user.chatId, "What would you like me to call you?");
    }

    if (command === "bot-name") {
        bot.answerCallbackQuery(queryId);
        registerInputCallback(user, (msg: TelegramBot.Message) => {
            const name = msg.text as string;
            user.setPreferredBotName(name);
            bot.sendMessage(user.chatId, "Thanks, I'll use that going forward.");
        });
        bot.sendMessage(user.chatId, "What would you like to call me?");
    }

    if (command === "bot-voice") {
        bot.answerCallbackQuery(queryId);
        sendVoiceSettingsPrompt(user);
    }

    if (command === "llm-provider") {
        bot.answerCallbackQuery(queryId);
        sendLLMProviderSettingsPrompt(user);
    }
}

export async function handleGeneralSettingsCommand(user: HennosUser) {
    const opts: TelegramBot.SendMessageOptions = {
        reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            inline_keyboard: [
                [
                    {
                        text: "Voice",
                        callback_data: "customize-bot-voice",
                    },
                    {
                        text: "AI Models",
                        callback_data: "customize-llm-provider",
                    },
                    {
                        text: "My Name",
                        callback_data: "customize-my-name",
                    },
                    {
                        text: "Bot Name",
                        callback_data: "customize-bot-name",
                    }
                ]
            ],
        }
    };

    const bot = TelegramBotInstance.instance();
    bot.sendMessage(user.chatId, "You can customize parts of Hennos by using the options below. What would you like to change? ", opts);
}