import os from "node:os";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper, sendVoiceMemoWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { Logger } from "../singletons/logger";
import { OpenAIWrapper } from "../singletons/openai";
import { processChatCompletion, updateChatContextWithName } from "./text/common";
import { buildPrompt } from "./text/private";
import { ChatMemory } from "../singletons/memory";

export function listen() {
    BotInstance.instance().on("voice", handleVoice);
}

async function handleVoice(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.voice) {
        return;
    }

    Logger.trace("voice", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    // Download the voice recording from Telegram
    const oggFilePath = await BotInstance.instance().downloadFile(msg.voice.file_id, os.tmpdir());

    try {
        const transcription = await OpenAIWrapper.instance().audio.transcriptions.create({
            model: "whisper-1",
            file: createReadStream(oggFilePath)
        });

        const prompt = buildPrompt(first_name);
        const context = await updateChatContextWithName(chatId, first_name, "user", transcription.text);

        await sendMessageWrapper(chatId, `\`\`\`\n${transcription.text}\n\`\`\``, { reply_to_message_id: msg.message_id });

        const response = await processChatCompletion(chatId, [
            ...prompt,
            ...context
        ]);

        await updateChatContextWithName(chatId, "Hennos", "assistant", response);

        const result = await OpenAIWrapper.instance().audio.speech.create({
            model: "tts-1",
            voice: "onyx",
            input: response,
            response_format: "opus"
        });

        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await sendMessageWrapper(chatId, response);
        await sendVoiceMemoWrapper(chatId, buffer);

        return;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("Error processing voice message: ", error.message, error.stack);
        await sendMessageWrapper(chatId, "Sorry, I was unable to process your voice message.");
    }

    unlink(oggFilePath);
}

function unlink(path: string) {
    try {
        fs.unlink(path);
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("Unable to clean up voice file:" + path, error.message);
    }
}
