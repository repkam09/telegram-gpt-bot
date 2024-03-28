import TelegramBot from "node-telegram-bot-api";
import { BotInstance } from "../../../singletons/telegram";
import { ValidTTSNames, getUserVoicePreference, setUserVoicePreference } from "../../voice";
import { OpenAIWrapper } from "../../../singletons/openai";
import { sendVoiceMemoWrapper } from "../../../utils";
import { Logger } from "../../../singletons/logger";
import { User } from "../../../singletons/memory";

type MessageWithText = TelegramBot.Message & { text: string }

export async function handleVoiceSettingsCallback(chatId: number, queryId: string, data: string) {
    // Set the voice and return to the user.
    const name = data.replace("voice-settings-", "").trim();

    const bot = BotInstance.instance();
    setUserVoicePreference(chatId, name as ValidTTSNames).then(() => {
        bot.answerCallbackQuery(queryId, {
            text: "Future audio messages will use the " + name + " voice."
        });
        bot.sendMessage(chatId, "Configuration saved. Future audio messages will use the " + name + " voice.");
    }).catch((err: unknown) => {
        Logger.error(`Error while updating voice settings for user ${chatId}`, err);
        bot.answerCallbackQuery(queryId, {
            text: "There was an error while updating your voice settings"
        });
        bot.sendMessage(chatId, "There was an error while updating your voice settings");
    });
}

export async function sendVoiceSettingsPrompt(chatId: number) {
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
    bot.sendMessage(chatId, "You can customize the voice that Hennos uses when sending audio messages. Select one of the options below:  ", opts);
}

export async function handleVoiceSettingsCommand(msg: MessageWithText) {
    return sendVoiceSettingsPrompt(msg.chat.id);
}

export async function handleVoiceReadCommand(user: User, text: string) {
    text = text.replace("/read", "").trim();
    if (text) {
        const voice = await getUserVoicePreference(user.chatId);
        const result = await OpenAIWrapper.instance().audio.speech.create({
            model: "tts-1",
            voice: voice,
            input: text,
            response_format: "opus"
        });

        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await sendVoiceMemoWrapper(user.chatId, buffer);
    }
}
