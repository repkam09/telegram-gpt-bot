import TelegramBot, { CallbackQuery, InlineQuery } from "node-telegram-bot-api";
import { isOnWhitelist, resetMemory, sendMessageWrapper, sendVoiceMemoWrapper } from "../../utils";
import { Logger } from "../../singletons/logger";
import { OpenAIWrapper } from "../../singletons/openai";
import { BotInstance } from "../../singletons/telegram";
import { ValidTTSNames, getUserVoicePreference, setUserVoicePreference } from "../voice";

type MessageWithText = TelegramBot.Message & { text: string }

export function handleCommandMessageInline(query: InlineQuery) {
    Logger.info("InlineQuery", query);
}

export async function handleCommandMessageCallback(query: CallbackQuery) {
    if (!query.data) {
        return;
    }

    Logger.info("CallbackQuery: ", `${query.from.id} ${query.id} ${query.data}`);

    if (query.data.startsWith("voice-settings-")) {
        // Set the voice and return to the user.
        const name = query.data.replace("voice-settings-", "").trim();

        const bot = BotInstance.instance();
        setUserVoicePreference(query.from.id, name as ValidTTSNames).then(() => {
            bot.answerCallbackQuery(query.id, {
                text: "Future audio messages will use the " + name + " voice."
            });
            bot.sendMessage(query.from.id, "Configuration saved. Future audio messages will use the " + name + " voice.");

            voiceRead(query.from.id, "Hey! This is a sample of the " + name + " voice. Hope you like it!");
        }).catch(() => {
            bot.answerCallbackQuery(query.id, {
                text: "There was an error while updating your voice settings"
            });
            bot.sendMessage(query.from.id, "There was an error while updating your voice settings");
        });
    }
}

export function handleCommandMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.chat.type !== "private") {
        return;
    }

    Logger.trace("text_command", msg);

    if (msg.text === "/reset") {
        return handleResetCommand(msg as MessageWithText);
    }

    if (msg.text === "/start") {
        return handleStartCommand(msg as MessageWithText);
    }

    if (msg.text === "/help" || msg.text === "/about") {
        return handleHelpCommand(msg as MessageWithText);
    }

    if (msg.text.startsWith("/read") && isOnWhitelist(msg.chat.id)) {
        return handleVoiceReadCommand(msg as MessageWithText);
    }

    if (msg.text.startsWith("/voice") && isOnWhitelist(msg.chat.id)) {
        return handleVoiceSettingsCommand(msg as MessageWithText);
    }

    return sendMessageWrapper(msg.chat.id, "Unknown Command");
}

const helpText = `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

This bot is whitelisted for use by approved users only.
Contact @repkam09 to request access!

Looking for other ideas? 

Try out voice messages in addition to text conversations, if you send a voice message Hennos will respond in both text and voice form.
You can customize the voice that Hennos uses with the /voice command. This voice is AI generated and provided via the OpenAI TTS service.

If you send an image Hennos will give you a description of what you sent. If you want to ask a question based on an image, you can ask right in the caption field.

For more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`;

const aboutText = `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

This bot is whitelisted for use by approved users only.
Contact @repkam09 to request access!

For more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`;

async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, aboutText);
}

async function handleHelpCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, helpText);
}

async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Previous chat context has been cleared.");
}

async function handleVoiceReadCommand(msg: MessageWithText) {
    const chatId = msg.chat.id;
    const text = msg.text.replace("/read", "").trim();
    if (text) {
        voiceRead(chatId, text);
    }
}

async function voiceRead(chatId: number, text: string) {
    const voice = await getUserVoicePreference(chatId);
    const result = await OpenAIWrapper.instance().audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: text,
        response_format: "opus"
    });

    const arrayBuffer = await result.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await sendVoiceMemoWrapper(chatId, buffer);
}

async function handleVoiceSettingsCommand(msg: MessageWithText) {
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
    bot.sendMessage(msg.chat.id, "You can customize the voice that Hennos uses when sending audio messages. Select one of the options below:  ", opts);
}
