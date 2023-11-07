import TelegramBot, { CallbackQuery, InlineQuery } from "node-telegram-bot-api";
import { isOnWhitelist, resetMemory, sendMessageWrapper, sendVoiceMemoWrapper } from "../../utils";
import { Logger } from "../../singletons/logger";
import { OpenAIWrapper } from "../../singletons/openai";

type MessageWithText = TelegramBot.Message & { text: string }

export function handleCommandMessageInline(query: InlineQuery) {
    Logger.info("InlineQuery", query);
}

export function handleCommandMessageCallback(query: CallbackQuery) {
    Logger.info("CallbackQuery", query);
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

    if (msg.text === "/start" || msg.text === "/help" || msg.text === "/about") {
        return handleStartCommand(msg as MessageWithText);
    }

    if (msg.text.startsWith("/read") && isOnWhitelist(msg.chat.id)) {
        return handleVoiceReadCommand(msg as MessageWithText);
    }

    return sendMessageWrapper(msg.chat.id, "Unknown Command");
}

const aboutText = `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

This bot is whitelisted for use by approved users only.
Contact @repkam09 to request access!

For more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`;

async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, aboutText);
}

async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Previous chat context has been cleared.");
}

async function handleVoiceReadCommand(msg: MessageWithText) {
    const chatId = msg.chat.id;
    const text = msg.text.replace("/read", "").trim();
    if (text) {
        const result = await OpenAIWrapper.instance().audio.speech.create({
            model: "tts-1",
            voice: "onyx",
            input: text,
            response_format: "opus"
        });
    
        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
    
        await sendVoiceMemoWrapper(chatId, buffer);
    }
}
