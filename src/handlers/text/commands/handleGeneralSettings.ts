import TelegramBot from "node-telegram-bot-api";
import { BotInstance } from "../../../singletons/telegram";
import { registerInputCallback } from "..";
import { sendVoiceSettingsPrompt } from "./handleVoiceSettings";
import { Config } from "../../../singletons/config";
import { isAdmin } from "../common";
import { Database } from "../../../singletons/prisma";

type MessageWithText = TelegramBot.Message & { text: string }

export async function handleGeneralSettingsCallback(chatId: number, queryId: string, data: string) {
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        if (!isAdmin(chatId)) {
            throw new Error("Message from unexpected user while in development mode: " + chatId);
        }
    }

    const bot = BotInstance.instance();

    // Set the voice and return to the user.
    const command = data.replace("customize-", "").trim();
    if (command === "personality") {
        bot.answerCallbackQuery(queryId);
        bot.sendMessage(chatId, "This feature is not available yet, but is coming soon.");
    }

    if (command === "my-name") {
        bot.answerCallbackQuery(queryId);
        registerInputCallback(chatId, (msg: TelegramBot.Message) => {
            Database.updateUser(chatId, {
                name: msg.text as string
            }).then(() => {
                bot.sendMessage(chatId, "Thanks! I'll call you " + msg.text + " going forward.");
            }).catch(() => {
                bot.sendMessage(chatId, "There was an error while updating your name. Please try again later.");
            });
        });
        bot.sendMessage(chatId, "What would you like me to call you?");
    }

    if (command === "bot-voice") {
        bot.answerCallbackQuery(queryId);
        sendVoiceSettingsPrompt(chatId);
    }


    if (command === "bot-name") {
        bot.answerCallbackQuery(queryId);
        registerInputCallback(chatId, (msg: TelegramBot.Message) => {
            Database.updateUser(chatId, {
                botName: msg.text as string
            }).then(() => {
                bot.sendMessage(chatId, "Thanks, I'll use that going forward.");
            }).catch(() => {
                bot.sendMessage(chatId, "There was an error while updating my name. Please try again later.");
            });
        });
        bot.sendMessage(chatId, "What would you like to call me?");
    }
}

export async function handleGeneralSettingsCommand(msg: MessageWithText) {
    const opts: TelegramBot.SendMessageOptions = {
        reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            inline_keyboard: [
                [
                    // {
                    //     text: "Personality",
                    //     callback_data: "customize-personality"
                    // },
                    {
                        text: "Voice",
                        callback_data: "customize-bot-voice",
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

    const bot = BotInstance.instance();
    bot.sendMessage(msg.chat.id, "You can customize parts of Hennos by using the options below. What would you like to change? ", opts);
}