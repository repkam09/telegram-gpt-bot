import TelegramBot from "node-telegram-bot-api";
import { BotInstance, registerInputCallback } from "../../../singletons/telegram";
import { sendVoiceSettingsPrompt } from "./handleVoiceSettings";
import { HennosUser } from "../../../singletons/user";
import OpenAI from "openai";

const commands = {
    voice: "voice",
    userName: "user-name",
    botName: "bot-name",
    apiKey: "api-key",
    personality: "personality",
};

type CommandStrings = keyof typeof commands;

export async function handleGeneralSettingsCallback(user: HennosUser, queryId: string, data: string) {
    const bot = BotInstance.instance();

    // Set the voice and return to the user.
    const command = JSON.parse(data).option as CommandStrings;
    bot.answerCallbackQuery(queryId);

    switch (command) {
    case commands.voice:
        return sendVoiceSettingsPrompt(user);
    case commands.personality:
        return bot.sendMessage(user.chatId, "This feature is not available yet, but is coming soon.");
    case commands.apiKey:
        registerInputCallback(user, async (msg: TelegramBot.Message) => {
            const apiKey = msg.text as string;
            try {
                const instance = new OpenAI({
                    apiKey,
                });
                await instance.models;
                bot.sendMessage(user.chatId, "Thanks! I've saved your API key and will use it for future requests.");
            } catch (err) {
                bot.sendMessage(user.chatId, "Sorry, that API key does not appear to be valid. Please try again.");
            }
        });
        return bot.sendMessage(user.chatId, "What OpenAI API key would you like me to use?");
    case commands.userName:
        registerInputCallback(user, (msg: TelegramBot.Message) => {
            const name = msg.text as string;
            user.setPreferredName(name);
            bot.sendMessage(user.chatId, "Thanks! I'll call you " + name + " going forward.");
        });
        return bot.sendMessage(user.chatId, "What would you like me to call you?");
    case commands.botName:
        registerInputCallback(user, (msg: TelegramBot.Message) => {
            const name = msg.text as string;
            user.setPreferredBotName(name);
            bot.sendMessage(user.chatId, "Thanks, I'll use that going forward.");
        });
        return bot.sendMessage(user.chatId, "What would you like to call me?");
    default:
        throw new Error("Invalid Command");
    }
}

export async function handleGeneralSettingsCommand(user: HennosUser) {
    const opts: TelegramBot.SendMessageOptions = {
        reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: false,
            inline_keyboard: [
                [
                    {
                        text: "Voice",
                        callback_data: JSON.stringify({ option: commands.voice }),
                    },
                    {
                        text: "Personality",
                        callback_data: JSON.stringify({ option: commands.personality }),
                    },
                    {
                        text: "Preferred Name",
                        callback_data: JSON.stringify({ option: commands.userName }),
                    },
                    {
                        text: "Alternate Bot Name",
                        callback_data: JSON.stringify({ option: commands.botName }),
                    },
                    {
                        text: "OpenAI API Key",
                        callback_data: JSON.stringify({ option: commands.apiKey }),
                    }
                ]
            ],
        }
    };

    const bot = BotInstance.instance();
    bot.sendMessage(user.chatId, "You can customize parts of Hennos by using the options below. What would you like to change? ", opts);
}