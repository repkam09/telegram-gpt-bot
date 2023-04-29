import os from "node:os";
import fs from "node:fs/promises";
import installer from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { createReadStream, createWriteStream } from "node:fs";
import { BotInstance } from "../singletons/telegram";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { Logger } from "../singletons/logger";
import { OpenAI } from "../singletons/openai";
import { processChatCompletion, updateChatContext } from "./text/common";
import { buildPrompt } from "./text/private";
import { ChatMemory } from "../singletons/memory";

ffmpeg.setFfmpegPath(installer.path);

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
    const mp3FilePath = await processVoiceFile(oggFilePath);

    try {
        const whisper = await processTranscription(mp3FilePath);

        await sendMessageWrapper(chatId, `\`\`\`\n${whisper}\n\`\`\``, { parse_mode: "Markdown", reply_to_message_id: msg.message_id });

        const prompt = buildPrompt(first_name);
        const context = await updateChatContext(chatId, "user", whisper);

        const response = await processChatCompletion(chatId, [
            ...prompt,
            ...context
        ]);

        await updateChatContext(chatId, "assistant", response);
        await sendMessageWrapper(chatId, response, { parse_mode: "Markdown", reply_to_message_id: msg.message_id });
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("Error processing voice message: ", error.message, error);
        await sendMessageWrapper(chatId, "Sorry, I was unable to process your voice message.");
    }

    unlink(oggFilePath);
    unlink(mp3FilePath);
}

async function processTranscription(path: string): Promise<string> {
    const stream = createReadStream(path);

    // @ts-expect-error Bad Typing on Library
    const transcription = await OpenAI.instance().createTranscription(stream, "whisper-1");
    return transcription.data.text;
}

function unlink(path: string) {
    try {
        fs.unlink(path);
    } catch (err) {
        Logger.error("Unable to clean up voice file:" + path);
    }
}

async function processVoiceFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const outPath = path + ".mp3";
        ffmpeg()
            .input(path)
            .audioQuality(96)
            .toFormat("mp3")
            .on("error", (error: unknown) => reject(error as Error))
            .on("exit", () => reject())
            .on("close", () => reject())
            .on("end", () => resolve(outPath))
            .pipe(createWriteStream(outPath), { end: true });
    });
}
