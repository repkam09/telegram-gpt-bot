import os from "node:os";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { BotInstance } from "../singletons/telegram";
import { isOnBlacklist, isOnWhitelist, sendAdminMessage, sendMessageWrapper, sendVoiceMemoWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { Logger } from "../singletons/logger";
import { OpenAIWrapper } from "../singletons/openai";
import { NotWhitelistedMessage, processChatCompletion, updateChatContext } from "./text/common";
import { buildPrompt } from "./text/private";
import { ChatMemory } from "../singletons/memory";

export type ValidTTSNames = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export function listen() {
    BotInstance.instance().on("voice", handleVoice);
}

async function handleVoice(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.voice) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("voice", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, NotWhitelistedMessage);
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


        const name = await ChatMemory.getPerUserValue<string>(chatId, "custom-name");
        const prompt = await buildPrompt(chatId, name ? name : first_name);
        const context = await updateChatContext(chatId, "user", transcription.text);

        await sendMessageWrapper(chatId, `\`\`\`\n${transcription.text}\n\`\`\``, { reply_to_message_id: msg.message_id });

        const response = await processChatCompletion(chatId, [
            ...prompt,
            ...context
        ]);

        await updateChatContext(chatId, "assistant", response);

        const voice = await getUserVoicePreference(chatId);

        const result = await OpenAIWrapper.instance().audio.speech.create({
            model: "tts-1",
            voice: voice,
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


export async function setUserVoicePreference(chatId: number, voice: ValidTTSNames): Promise<void> {
    return ChatMemory.storePerUserValue<ValidTTSNames>(chatId, "voice-settings", voice);
}

export async function getUserVoicePreference(chatId: number): Promise<ValidTTSNames> {
    const voice = await ChatMemory.getPerUserValue<ValidTTSNames>(chatId, "voice-settings");
    return voice || "onyx";
}