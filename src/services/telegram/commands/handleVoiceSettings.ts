import TelegramBot from "node-telegram-bot-api";
import { handleHennosResponse, TelegramBotInstance } from "../telegram";
import { Logger } from "../../../singletons/logger";
import { HennosUser } from "../../../singletons/consumer";
import { HennosOpenAISingleton } from "../../../singletons/llms/openai";
import { ValidTTSName } from "../../../types";

export async function handleVoiceSettingsCallback(user: HennosUser, queryId: string, data: string) {
    // Set the voice and return to the user.
    const name = data.replace("voice-settings-", "").trim();

    const bot = TelegramBotInstance.instance();
    user.setPreferredVoice(name as ValidTTSName).then(() => {
        bot.answerCallbackQuery(queryId, {
            text: "Future audio messages will use the " + name + " voice."
        });
        bot.sendMessage(user.chatId, "Configuration saved. Future audio messages will use the " + name + " voice.");
    }).catch((err: unknown) => {
        const error = err as Error;
        Logger.error(user, `Error while updating voice settings: ${error.message}`, error);
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

    const bot = TelegramBotInstance.instance();
    bot.sendMessage(user.chatId, "You can customize the voice that Hennos uses when sending audio messages. Select one of the options below:  ", opts);
}

export async function handleReadCommand(req: HennosUser, text: string) {
    TelegramBotInstance.setTelegramIndicator(req, "upload_voice");

    const trimmed = text.replace("/read", "").trim();
    try {
        TelegramBotInstance.setTelegramIndicator(req, "record_voice");
        const response = await HennosOpenAISingleton.instance().speech(req, trimmed);
        TelegramBotInstance.setTelegramIndicator(req, "upload_voice");
        return handleHennosResponse(req, response, {});
    } catch (err) {
        const error = err as Error;
        Logger.error(req, `handleTelegramVoiceMessage unable to process LLM response into speech. ${error.message}`, error);
    }
}