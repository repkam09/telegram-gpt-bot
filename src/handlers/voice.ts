import os from "node:os";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper, sendVoiceMemoWrapper } from "../utils";
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
    if (msg.chat.type !== "private" || !msg.from || !msg.voice) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (!user.whitelisted) {
        return sendMessageWrapper(user.chatId, NotWhitelistedMessage);
    }

    // Download the voice recording from Telegram
    const oggFilePath = await BotInstance.instance().downloadFile(msg.voice.file_id, os.tmpdir());

    try {
        const transcription = await OpenAIWrapper.instance().audio.transcriptions.create({
            model: "whisper-1",
            file: createReadStream(oggFilePath)
        });


        const name = await ChatMemory.getPerUserValue<string>(user.chatId, "custom-name");
        const prompt = await buildPrompt(user.chatId, name ? name : user.firstName);
        const context = await updateChatContext(user.chatId, "user", transcription.text);

        await sendMessageWrapper(user.chatId, `\`\`\`\n${transcription.text}\n\`\`\``, { reply_to_message_id: msg.message_id });

        const response = await processChatCompletion(user.chatId, [
            ...prompt,
            ...context
        ]);

        await updateChatContext(user.chatId, "assistant", response);

        const voice = await getUserVoicePreference(user.chatId);

        const result = await OpenAIWrapper.instance().audio.speech.create({
            model: "tts-1",
            voice: voice,
            input: response,
            response_format: "opus"
        });

        const arrayBuffer = await result.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await sendMessageWrapper(user.chatId, response);
        await sendVoiceMemoWrapper(user.chatId, buffer);

        return;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("Error processing voice message: ", error.message, error.stack);
        await sendMessageWrapper(user.chatId, "Sorry, I was unable to process your voice message.");
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