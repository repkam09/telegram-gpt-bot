import TelegramBot from "node-telegram-bot-api";
import { BotInstance } from "../../../singletons/telegram";
import { ValidTTSNames } from "../../voice";
import { OpenAIWrapper } from "../../../singletons/openai";
import { Logger } from "../../../singletons/logger";
import { HennosUser } from "../../../singletons/user";

export async function handleVoiceSettingsCallback(user: HennosUser, queryId: string, data: string) {
    // Set the voice and return to the user.
    const name = data.replace("voice-settings-", "").trim();

    const bot = BotInstance.instance();
    user.setPreferredVoice(name as ValidTTSNames).then(() => {
        bot.answerCallbackQuery(queryId, {
            text: "Future audio messages will use the " + name + " voice."
        });
        bot.sendMessage(user.chatId, "Configuration saved. Future audio messages will use the " + name + " voice.");
    }).catch((err: unknown) => {
        Logger.error(user, "Error while updating voice settings", err);
        bot.answerCallbackQuery(queryId, {
            text: "There was an error while updating your voice settings"
        });
        bot.sendMessage(user.chatId, "There was an error while updating your voice settings");
    });
}

export async function sendVoiceSettingsPrompt(user: HennosUser) {
    const opts: TelegramBot.SendMessageOptions = {
        reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            inline_keyboard: [
                [
                    {
                        text: "Alloy",
                        callback_data: "voice-settings-alloy",
                    },
                    {
                        text: "Echo",
                        callback_data: "voice-settings-echo",
                    },
                    {
                        text: "Fable",
                        callback_data: "voice-settings-fable",
                    },
                ],
                [
                    {
                        text: "Onyx",
                        callback_data: "voice-settings-onyx",
                    },
                    {
                        text: "Nova",
                        callback_data: "voice-settings-nova",
                    },
                    {
                        text: "Shimmer",
                        callback_data: "voice-settings-shimmer",
                    }
                ]
            ],

        }
    };

    const bot = BotInstance.instance();
    bot.sendMessage(user.chatId, "You can customize the voice that Hennos uses when sending audio messages. Select one of the options below:  ", opts);
}

export async function handleVoiceReadCommand(user: HennosUser, text: string) {
    text = text.replace("/read", "").trim();
    if (text) {
        const { voice } = await user.getPreferences();
        const instance = await OpenAIWrapper.instance(user);
        const result = await instance.audio.speech.create({
            model: "tts-1",
            voice: voice as ValidTTSNames,
            input: text,
            response_format: "opus"
        });

        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await BotInstance.sendVoiceMemoWrapper(user.chatId, buffer);
    }
}
