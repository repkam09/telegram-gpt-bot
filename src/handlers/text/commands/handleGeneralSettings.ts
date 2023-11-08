import TelegramBot from "node-telegram-bot-api";
import { BotInstance } from "../../../singletons/telegram";
import { registerInputCallback } from "..";
import { ChatMemory } from "../../../singletons/memory";
import { sendVoiceSettingsPrompt } from "./handleVoiceSettings";

type MessageWithText = TelegramBot.Message & { text: string }

export async function handleGeneralSettingsCallback(chatId: number, queryId: string, data: string) {
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
            const name = msg.text as string;
            ChatMemory.storePerUserValue(chatId, "custom-name", name);
            bot.sendMessage(chatId, "Thanks! I'll call you " + name + " going forward.");
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
            const name = msg.text as string;
            ChatMemory.storePerUserValue(chatId, "custom-bot-name", name);
            bot.sendMessage(chatId, "Thanks, I'll use that going forward.");
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