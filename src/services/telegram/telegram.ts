import fs from "node:fs";
import path from "node:path";
import { IncomingMessage } from "node:http";

import TelegramBot from "node-telegram-bot-api";
import mimetype from "mime-types";

import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handleDocumentMessage } from "../../handlers/document";
import { handleImageMessage } from "../../handlers/photos";
import { handleVoiceMessage } from "../../handlers/voice";
import { handleVoiceSettingsCallback } from "./commands/handleVoiceSettings";
import { handleGeneralSettingsCallback } from "./commands/handleGeneralSettings";
import { handlePrivateMessage } from "../../handlers/text/private";
import { handleGroupMessage } from "../../handlers/text/group";
import { handleCommandGroupMessage, handleCommandMessage } from "./commands";
import { HennosUser } from "../../singletons/user";
import { HennosGroup } from "../../singletons/group";
import { handleLLMProviderSettingsCallback } from "./commands/handleLLMProviderSettings";
import { HennosConsumer } from "../../singletons/base";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { handleCalendarImport } from "../../tools/ImportCalendar";
import { HennosResponse } from "../../types";
import { handleAudioMessage } from "../../handlers/audio";
import { StoreKeyValueMemory } from "../../tools/UserFactsTool";

type InputCallbackFunction = (msg: TelegramBot.Message) => Promise<void> | void
type MessageWithText = TelegramBot.Message & { text: string }
type TelegramError = Error & {
    code: "EFATAL" | "EPARSE" | "ETELEGRAM"
    response: IncomingMessage | undefined
}

type TelegramReactionEmotes = "👍" | "👎" | "❤" | "🔥" | "🥰" | "👏" | "😁" | "🤔" | "🤯" | "😱" | "🤬" | "😢" | "🎉" | "🤩" | "🤮" | "💩" | "🙏" | "👌" | "🕊" | "🤡" | "🥱" | "🥴" | "😍" | "🐳" | "❤‍🔥" | "🌚" | "🌭" | "💯" | "🤣" | "⚡" | "🍌" | "🏆" | "💔" | "🤨" | "😐" | "🍓" | "🍾" | "💋" | "🖕" | "😈" | "😴" | "😭" | "🤓" | "👻" | "👨‍💻" | "👀" | "🎃" | "🙈" | "😇" | "😨" | "🤝" | "✍" | "🤗" | "🫡" | "🎅" | "🎄" | "☃" | "💅" | "🤪" | "🗿" | "🆒" | "💘" | "🙉" | "🦄" | "😘" | "💊" | "🙊" | "😎" | "👾" | "🤷‍♂" | "🤷" | "🤷‍♀" | "😡"

const InputCallbackFunctionMap = new Map<number, InputCallbackFunction>();
const PendingChatMap = new Map<number, string[]>();
const PendingChatTimerMap = new Map<number, NodeJS.Timeout>();

export class TelegramBotInstance {
    static _instance: TelegramBot;

    static instance(): TelegramBot {
        if (!TelegramBotInstance._instance) {
            TelegramBotInstance._instance = new TelegramBot(Config.TELEGRAM_BOT_KEY, { polling: true, });

            TelegramBotInstance._instance.on("polling_error", (err: unknown) => {
                const error = err as TelegramError;
                Logger.warn(undefined, "Telegram Polling error: ", error.name, error.code, error.message);
            });
        }

        return TelegramBotInstance._instance;
    }

    static async sendMessageWrapper(req: HennosConsumer, content: string, options: TelegramBot.SendMessageOptions = {}) {
        if (!content) {
            throw new Error("Message content is undefined");
        }

        if (!content.length) {
            throw new Error("Message content does not have a length property");
        }

        if (content.length < 4096) {
            return TelegramBotInstance.sendTelegramMessageWithRetry(req, content, options);
        }

        const chunks = chunkSubstr(content, 4096);
        for (let i = 0; i < chunks.length; i++) {
            return TelegramBotInstance.sendTelegramMessageWithRetry(req, chunks[i], options);
        }
    }

    /**
     * Your photo must be in PNG format. The maximum file size is 20 MB.
     */
    static async sendImageWrapper(req: HennosConsumer, path: string, options: TelegramBot.SendPhotoOptions = {}): Promise<void> {
        if (!path) {
            throw new Error("Message content is undefined");
        }

        const bot = TelegramBotInstance.instance();
        await bot.sendPhoto(req.chatId, fs.createReadStream(path), options, { contentType: "image/png", filename: path.split("/").pop() || "image.png" });
    }

    /**
     * Your audio must be in an .OGG file encoded with OPUS, or in .MP3 format, or in .M4A format (other formats may be sent as Audio or Document)
     */
    static async sendVoiceMemoWrapper(req: HennosConsumer, content: Buffer, options: TelegramBot.SendVoiceOptions = {}): Promise<void> {
        if (!content) {
            throw new Error("Message content is undefined");
        }

        if (!content.length) {
            throw new Error("Message content does not have a length property");
        }

        const bot = TelegramBotInstance.instance();
        await bot.sendVoice(req.chatId, content, options, { contentType: "audio/ogg", filename: "voice-memo.ogg" });
    }

    static async sendAdminMessage(content: string) {
        if (Config.TELEGRAM_BOT_ADMIN !== -1 && !Config.HENNOS_DEVELOPMENT_MODE) {
            try {
                await TelegramBotInstance.instance().sendMessage(Config.TELEGRAM_BOT_ADMIN, content, {
                    disable_notification: true
                });
            } catch {
                Logger.error(undefined, "Failed to send admin message");
            }
        }
    }

    static async sendTelegramMessageWithRetry(user: HennosConsumer, content: string, options: TelegramBot.SendMessageOptions) {
        const bot = TelegramBotInstance.instance();
        try {
            await bot.sendMessage(user.chatId, content, { ...options, parse_mode: "Markdown" });
        } catch (err1: unknown) {
            try {
                await bot.sendMessage(user.chatId, content, { ...options, parse_mode: undefined });
            } catch (err2: unknown) {
                const error1 = err1 as Error;
                const error2 = err2 as Error;
                Logger.error(user, `Failed 2x to send Telegram message. Err1=${error1.message}, Err2=${error2.message}`);
            }
        }
    }

    static setTelegramIndicator(req: HennosConsumer, action: TelegramBot.ChatAction): void {
        TelegramBotInstance.instance().sendChatAction(req.chatId, action).catch((err: unknown) => {
            Logger.warn(req, `Error while setting Telegram ${action} indicator: ${err}`);
        });
    }

    static setTelegramMessageReact(req: HennosConsumer, msg: TelegramBot.Message, emote?: TelegramReactionEmotes): void {
        const options = {
            reaction: emote ? [{
                type: "emoji",
                emoji: emote
            }] : []
        };

        // @ts-expect-error - The Types are wrong for the bot instance, it does support setMessageReaction 
        TelegramBotInstance.instance().setMessageReaction(req.chatId, msg.message_id, options).then(() => {
            Logger.debug(req, `Set reaction on Telegram message ${msg.message_id}`);
        }).catch((err: unknown) => {
            const error = err as Error;
            Logger.error(req, `Error while setting reaction on Telegram message ${msg.message_id}: `, error.message);
        });
    }

    static async init() {
        const bot = TelegramBotInstance.instance();

        bot.on("text", async (msg) => {
            if (!msg.from || !msg.text) {
                return;
            }

            const user = await HennosUser.async(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
            if (Config.HENNOS_DEVELOPMENT_MODE) {
                if (msg.from.id !== Config.TELEGRAM_BOT_ADMIN) {
                    Logger.warn(user, "Ignoring message from non-admin user due to HENNOS_DEVELOPMENT_MODE true");
                    return;
                }
            }

            // Check if the user is blacklisted
            const blacklisted = await HennosConsumer.isBlacklisted(user.chatId);
            if (blacklisted) {
                Logger.info(user, `Ignoring message from blacklisted user. User was blacklisted at: ${blacklisted.datetime.toISOString()}`);
                return;
            }

            if (msg.chat.type !== "private") {
                const group = await HennosGroup.async(msg.chat.id, msg.chat.title);

                // Check if the group is blacklisted
                const blacklisted = await HennosConsumer.isBlacklisted(group.chatId);
                if (blacklisted) {
                    Logger.info(user, `Ignoring message from blacklisted group. Group was blacklisted at: ${blacklisted.datetime.toISOString()}`);
                    return;
                }

                const commands = (msg.entities ?? []).filter((entity) => entity.type === "bot_command" && entity.offset === 0);
                if (commands.length) {
                    msg.text = replaceTelegramBotName(msg.text, "", "i");
                    return handleTelegramCommandGroupMessage(user, group, msg as MessageWithText);
                }

                return handleTelegramGroupMessage(user, group, msg as MessageWithText);
            }

            if (msg.chat.type === "private") {
                // Check if this is a command sent in a private chat
                if (msg.text.startsWith("/")) {
                    Logger.trace(user, `text_command: ${msg.text}`);
                    return handleTelegramCommandMessage(user, msg as MessageWithText);
                }

                // Check if we are waiting for a response from the user
                if (InputCallbackFunctionMap.has(user.chatId)) {
                    const callback = InputCallbackFunctionMap.get(user.chatId) as InputCallbackFunction;
                    InputCallbackFunctionMap.delete(user.chatId);
                    return callback(msg);
                }

                if (msg.forward_date) {
                    if (msg.forward_from) {
                        const forward = await HennosUser.async(msg.forward_from.id, msg.forward_from.first_name, msg.forward_from.last_name, msg.forward_from.username);
                        Logger.trace(user, `text_forwarded: ${forward.toString()}`);
                        return user.updateUserChatContext(user, `Forwarded message from '${msg.forward_from.first_name}': ${msg.text}}`);
                    }

                    if (msg.forward_sender_name) {
                        Logger.trace(user, `text_forwarded: ${msg.forward_sender_name}`);
                        return user.updateUserChatContext(user, `Forwarded message from '${msg.forward_sender_name}': ${msg.text}}`);
                    }

                    // @ts-expect-error - The Types are wrong for the bot instance, it does support forward_origin
                    if (msg.forward_origin && msg.forward_origin.chat) {
                        // @ts-expect-error - See Above
                        Logger.trace(user, `text_forwarded: ${msg.forward_origin.chat.title}`);
                        // @ts-expect-error - See Above
                        return user.updateUserChatContext(user, `Forwarded message from '${msg.forward_origin.chat.title}': ${msg.text}}`);
                    }

                    Logger.trace(user, "text_forwarded");
                    return user.updateUserChatContext(user, `Forwarded message: ${msg.text}}`);
                }

                if (msg.reply_to_message && msg.reply_to_message.from) {
                    const reply = await HennosUser.async(msg.reply_to_message.from.id, msg.reply_to_message.from.first_name, msg.reply_to_message.from.last_name, msg.reply_to_message.from.username);
                    Logger.trace(user, `text_reply: ${reply.toString()}`);
                    await user.updateUserChatContext(user, `Reply to message from '${msg.reply_to_message.from.first_name}': \n===\n ${msg.reply_to_message.text}\n===\n`);
                }

                return handleTelegramPrivateMessage(user, msg as MessageWithText);
            }
        });

        bot.on("audio", async (msg) => {
            return validateIncomingMessage(msg, "audio", handleTelegramAudioMessage);
        });

        bot.on("contact", async (msg) => {
            return validateIncomingMessage(msg, "contact", handleTelegramContactMessage);
        });

        bot.on("document", async (msg) => {
            return validateIncomingMessage(msg, "document", handleTelegramDocumentMessage);
        });

        bot.on("location", async (msg) => {
            return validateIncomingMessage(msg, "location", handleTelegramLocationMessage);
        });

        bot.on("photo", async (msg) => {
            return validateIncomingMessage(msg, "photo", handleTelegramPhotoMessage);
        });

        bot.on("voice", async (msg) => {
            return validateIncomingMessage(msg, "voice", handleTelegramVoiceMessage);
        });

        bot.on("sticker", async (msg) => {
            return handleTelegramStickerMessage(msg as TelegramBot.Message & { sticker: TelegramBot.Sticker });
        });

        bot.on("callback_query", async (query: TelegramBot.CallbackQuery) => {
            if (query.data) {
                const user = await HennosUser.async(query.from.id, query.from.first_name, query.from.last_name, query.from.username);

                if (query.data.startsWith("voice-settings-")) {
                    return handleVoiceSettingsCallback(user, query.id, query.data);
                }

                if (query.data.startsWith("llm-settings-")) {
                    return handleLLMProviderSettingsCallback(user, query.id, query.data);
                }

                if (query.data.startsWith("customize-")) {
                    return handleGeneralSettingsCallback(user, query.id, query.data);
                }
            }
        });
    }
}

async function handleTelegramCommandGroupMessage(user: HennosUser, group: HennosGroup, msg: MessageWithText) {
    return handleCommandGroupMessage(user, group, msg.text);
}

async function handleTelegramCommandMessage(user: HennosUser, msg: MessageWithText) {
    return handleCommandMessage(user, msg);
}

async function handleTelegramGroupMessage(user: HennosUser, group: HennosGroup, msg: MessageWithText): Promise<void> {
    // If the user has experimental features enabled, also enable for the group request
    if (user.experimental) {
        Logger.debug(group, `User ${user.displayName} has experimental features enabled, enabling for group`);
        group.experimental = true;
    }

    if (msg.forward_date) {
        if (msg.forward_from) {
            const forward = await HennosUser.async(msg.forward_from.id, msg.forward_from.first_name, msg.forward_from.last_name, msg.forward_from.username);
            Logger.trace(group, `text_group_forwarded: ${forward.toString()}`);
            return group.updateUserChatContext(user, `Forwarded message from '${msg.forward_from.first_name}': ${msg.text}}`);
        }

        if (msg.forward_sender_name) {
            Logger.trace(group, `text_group_forwarded: ${msg.forward_sender_name}`);
            return group.updateUserChatContext(user, `Forwarded message from '${msg.forward_sender_name}': ${msg.text}}`);
        }

        // @ts-expect-error - The Types are wrong for the bot instance, it does support forward_origin
        if (msg.forward_origin && msg.forward_origin.chat) {
            // @ts-expect-error - See Above
            Logger.trace(group, `text_group_forwarded: ${msg.forward_origin.chat.title}`);
            // @ts-expect-error - See Above
            return group.updateUserChatContext(user, `Forwarded message from '${msg.forward_origin.chat.title}': ${msg.text}}`);
        }

        Logger.trace(group, "text_group_forwarded");
        return group.updateUserChatContext(user, `Forwarded message: ${msg.text}}`);
    }

    if (msg.reply_to_message && msg.reply_to_message.from) {
        const reply = await HennosUser.async(msg.reply_to_message.from.id, msg.reply_to_message.from.first_name, msg.reply_to_message.from.last_name, msg.reply_to_message.from.username);
        Logger.trace(group, `text_group_reply: ${reply.toString()}`);
        await group.updateUserChatContext(user, `Reply to message from '${msg.reply_to_message.from.first_name}': \n===\n${user.displayName}: ${msg.reply_to_message.text}\n===\n`);
    }

    // Check if the user @'d the bot in their message
    if (!hasGroupPrefix(msg.entities ?? [], msg.text)) {
        if (Config.TELEGRAM_GROUP_CONTEXT) {
            Logger.trace(group, `text_group_context: ${user.toString()}`);

            const cleaned = replaceTelegramBotName(msg.text, "Hennos", "ig");
            // Update the chat context with the user's message without generating a response
            return group.updateUserChatContext(user, `${user.displayName}: ${cleaned}`);
        }
        return;
    }

    Logger.trace(group, `text_group: ${user.displayName}`);
    // If the user did @ the bot, strip out that @ prefix before processing the message
    TelegramBotInstance.setTelegramIndicator(group, "typing");

    const cleaned = replaceTelegramBotName(msg.text, "Hennos", "ig");
    const response = await handleGroupMessage(user, group, `${user.displayName}: ${cleaned}`);
    return handleHennosResponse(group, response, { reply_to_message_id: msg.message_id });
}

async function handleTelegramPrivateMessage(user: HennosUser, msg: MessageWithText) {
    // Reset the time between messages timer
    clearTimeout(PendingChatTimerMap.get(user.chatId));

    // Check if we have other messages in the map
    const current = PendingChatMap.get(user.chatId) || [];
    const cleaned = replaceTelegramBotName(msg.text, "Hennos", "ig");
    current.push(cleaned);
    PendingChatMap.set(user.chatId, current);

    // Set the timer to process the mssages if we dont get any more within 2 seconds
    const timeout = setTimeout(async () => {
        // Clean up the timer if we fire! 
        PendingChatTimerMap.delete(user.chatId);

        // Get all the messages, there might be more than one.
        const messages = PendingChatMap.get(user.chatId);

        // Clean up the pending chat map incase another message comes in
        PendingChatMap.delete(user.chatId);

        // If we somehow don't have any messages, return
        if (!messages) return;

        // If we have one or more messages, process them
        Logger.trace(user, "text_private");
        TelegramBotInstance.setTelegramIndicator(user, "typing");
        const response = await handlePrivateMessage(user, messages.length === 1 ? messages[0] : messages.join("\n"));

        // Send the response to the user
        return handleHennosResponse(user, response, {});
    }, 2000);

    PendingChatTimerMap.set(user.chatId, timeout);
}

async function handleTelegramVoiceMessage(user: HennosUser, msg: TelegramBot.Message & { voice: TelegramBot.Voice }) {
    TelegramBotInstance.setTelegramIndicator(user, "typing");
    const tempFilePath = await downloadTelegramFile(msg.voice.file_id, Config.LOCAL_STORAGE(user));
    if (!tempFilePath) {
        return TelegramBotInstance.sendMessageWrapper(user, "There was an error while processing your file.");
    }

    const response1 = await handleVoiceMessage(user, tempFilePath);
    if (response1.__type === "string") {
        TelegramBotInstance.setTelegramIndicator(user, "record_voice");
        try {
            const response2 = await HennosOpenAISingleton.instance().speech(user, response1.payload);
            TelegramBotInstance.setTelegramIndicator(user, "upload_voice");
            await handleHennosResponse(user, response2, {});
        } catch (err) {
            Logger.error(user, "handleTelegramVoiceMessage unable to process LLM response into speech.", err);
        }
    }

    return handleHennosResponse(user, response1, {});
}

async function handleTelegramPhotoMessage(user: HennosUser, msg: TelegramBot.Message & { photo: TelegramBot.PhotoSize[] }) {
    TelegramBotInstance.setTelegramMessageReact(user, msg, "👀");

    const largestImage = msg.photo.reduce((max, obj) => {
        return (obj.width * obj.height > max.width * max.height) ? obj : max;
    });

    const tempFilePath = await downloadTelegramFile(largestImage.file_id, Config.LOCAL_STORAGE(user));
    if (!tempFilePath) {
        return TelegramBotInstance.sendMessageWrapper(user, "There was an error while processing your file.");
    }

    TelegramBotInstance.setTelegramMessageReact(user, msg);

    const mime_type = mimetype.contentType(path.extname(tempFilePath));

    if (msg.caption) {
        TelegramBotInstance.setTelegramIndicator(user, "typing");
    }

    const response = await handleImageMessage(user, { local: tempFilePath, mime: mime_type || "application/octet-stream" }, msg.caption);
    return handleHennosResponse(user, response, {});
}

export async function handleHennosResponse(req: HennosConsumer, response: HennosResponse, options: TelegramBot.SendMessageOptions): Promise<void> {
    switch (response.__type) {
        case "string": {
            if (!response.payload) {
                Logger.warn(req, "Received empty string response from Hennos");
                return Promise.resolve();
            }

            return TelegramBotInstance.sendMessageWrapper(req, response.payload, options);
        }

        case "error": {
            if (!response.payload) {
                Logger.warn(req, "Received empty error response from Hennos");
                return Promise.resolve();
            }

            return TelegramBotInstance.sendMessageWrapper(req, response.payload, options);
        }

        case "empty": {
            return Promise.resolve();
        }

        case "arraybuffer": {
            try {
                await TelegramBotInstance.sendVoiceMemoWrapper(req, Buffer.from(response.payload));
            } catch (err) {
                const error = err as Error;
                Logger.warn(req, "Unable to send voice memo.", error.message);
            }
        }
    }
}

async function handleTelegramLocationMessage(user: HennosUser, msg: TelegramBot.Message & { location: TelegramBot.Location }) {
    TelegramBotInstance.setTelegramIndicator(user, "find_location");
    await user.updateLocation(msg.location.latitude, msg.location.longitude);
    return TelegramBotInstance.sendMessageWrapper(user, "Location information updated.");
}

async function downloadTelegramFile(fileId: string, path: string): Promise<string | null> {
    const bot = TelegramBotInstance.instance();
    try {
        const telegramFileInfo = await bot.getFile(fileId);
        if (telegramFileInfo.file_path) {
            Logger.debug(undefined, "Downloading file from Telegram: ", telegramFileInfo.file_id, telegramFileInfo.file_path, telegramFileInfo.file_size);
        }

        const file = await bot.downloadFile(fileId, path);

        return file;
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(undefined, "Error downloading file from Telegram: ", error.message, error.stack);
    }
    return null;
}

async function handleTelegramAudioMessage(user: HennosUser, msg: TelegramBot.Message & { audio: TelegramBot.Audio }) {
    TelegramBotInstance.setTelegramIndicator(user, "typing");
    const tempFilePath = await downloadTelegramFile(msg.audio.file_id, Config.LOCAL_STORAGE(user));
    if (!tempFilePath) {
        return TelegramBotInstance.sendMessageWrapper(user, "There was an error while processing your file.");
    }

    const response1 = await handleAudioMessage(user, tempFilePath);
    if (response1.__type === "string") {
        TelegramBotInstance.setTelegramIndicator(user, "record_voice");
        try {
            const response2 = await HennosOpenAISingleton.instance().speech(user, response1.payload);
            TelegramBotInstance.setTelegramIndicator(user, "upload_voice");
            await handleHennosResponse(user, response2, {});
        } catch (err) {
            Logger.error(user, "handleTelegramAudioMessage unable to process LLM response into speech.", err);
        }
    }

    return handleHennosResponse(user, response1, {});
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleTelegramContactMessage(user: HennosUser, msg: TelegramBot.Message & { contact: TelegramBot.Contact }) {
    TelegramBotInstance.setTelegramIndicator(user, "typing");
    Logger.debug(user, "contact", msg.contact);

    await StoreKeyValueMemory.callback(user, {
        key: JSON.stringify({
            type: "contact",
            first_name: msg.contact.first_name,
            last_name: msg.contact.last_name
        }), value: JSON.stringify(msg.contact)
    }, {});

    return TelegramBotInstance.sendMessageWrapper(user, "Contact information stored.");
}

async function handleTelegramCalendarMessage(user: HennosUser, file: string) {
    try {
        const result = await handleCalendarImport(user, file);
        if (result) {
            await user.updateUserChatContext(user, "I just uploaded an ICS calendar file. Could you import those events into our chat context?");
            await user.updateAssistantChatContext(`Calendar imported successfully. Here are the events I found: ${JSON.stringify(result)}`);
            return TelegramBotInstance.sendMessageWrapper(user, "Calendar imported successfully.");
        } else {
            return TelegramBotInstance.sendMessageWrapper(user, "An error occured while processing your calendar.");
        }
    } catch (err) {
        Logger.error(user, "Error while processing calendar import", err);
        return TelegramBotInstance.sendMessageWrapper(user, "An error occured while processing your calendar.");
    }
}

async function handleTelegramDocumentMessage(user: HennosUser, msg: TelegramBot.Message & { document: TelegramBot.Document }) {
    TelegramBotInstance.setTelegramMessageReact(user, msg, "👀");
    const tempFilePath = await downloadTelegramFile(msg.document.file_id, Config.LOCAL_STORAGE(user));
    if (!tempFilePath) {
        return TelegramBotInstance.sendMessageWrapper(user, "There was an error while processing your file.");
    }

    const ext = path.extname(tempFilePath) ? path.extname(tempFilePath).substring(1) : ".bin";

    if (ext === "ics") {
        TelegramBotInstance.setTelegramMessageReact(user, msg);
        return handleTelegramCalendarMessage(user, tempFilePath);
    }

    if (ext === "mp3" || ext === "ogg" || ext === "wav" || ext === "flac" || ext === "oga" || ext === "m4a") {
        TelegramBotInstance.setTelegramMessageReact(user, msg);
        return handleTelegramAudioMessage(user, {
            ...msg,
            audio: { file_id: msg.document.file_id, duration: -1, file_unique_id: msg.document.file_unique_id }
        });
    }

    if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp" || ext === "bmp" || ext === "tiff") {
        TelegramBotInstance.setTelegramMessageReact(user, msg);
        return handleTelegramPhotoMessage(user, {
            ...msg,
            photo: [{ file_id: msg.document.file_id, file_unique_id: msg.document.file_unique_id, width: -1, height: -1 }]
        });
    }

    const response = await handleDocumentMessage(user, tempFilePath, ext, msg.document.file_unique_id);
    await user.updateUserChatContext(user, "I just uploaded a document. Could you provide a summary of it?");
    await user.updateAssistantChatContext(response);

    TelegramBotInstance.setTelegramMessageReact(user, msg);
    return TelegramBotInstance.sendMessageWrapper(user, response);
}

async function handleTelegramStickerMessage(msg: TelegramBot.Message & { sticker: TelegramBot.Sticker }) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.sticker) {
        return;
    }

    const user = await HennosUser.async(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
    Logger.trace(user, "sticker");

    const { set_name, emoji } = msg.sticker;
    if (set_name && emoji) {
        return;
    }

    try {
        // This is a silly feature that fixes an issue in Telegram where some images are incorrectly sent as stickers
        // This will download the sticker, and re-upload it as a photo
        const stickerPath = await downloadTelegramFile(msg.sticker.file_id, Config.LOCAL_STORAGE(user));
        if (!stickerPath) {
            return;
        }

        await TelegramBotInstance.instance().sendPhoto(chatId, fs.createReadStream(stickerPath), { reply_to_message_id: msg.message_id, caption: "Here, I RepBig'd that for you!" }, { contentType: "image/webp" });
    } catch (err) {
        const user = await HennosUser.async(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
        Logger.error(user, err);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateIncomingMessage(msg: unknown, requiredProperty: keyof TelegramBot.Message, handler: (req: HennosUser, msg: any) => Promise<void>): Promise<void> {
    const message = msg as TelegramBot.Message;
    if (message.chat.type !== "private" || !message.from) {
        return;
    }

    const user = await HennosUser.async(message.from.id, message.from.first_name, message.from.last_name, message.from.username);
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        if (message.from.id !== Config.TELEGRAM_BOT_ADMIN) {
            Logger.warn(user, "Ignoring message from non-admin user due to HENNOS_DEVELOPMENT_MODE true");
            return;
        }
    }

    // Check if the user is blacklisted
    const blacklisted = await HennosConsumer.isBlacklisted(user.chatId);
    if (blacklisted) {
        Logger.info(user, `Ignoring message from blacklisted user. User was blacklisted at: ${blacklisted.datetime.toISOString()}`);
        return;
    }

    if (!message[requiredProperty]) {
        return;
    }

    if (!user.whitelisted) {
        Logger.trace(user, `${requiredProperty} [but not whitelisted]`);
        return TelegramBotInstance.sendMessageWrapper(user, "Sorry, you have not been whitelisted to use this feature.");
    }

    Logger.trace(user, requiredProperty);
    return handler(user, message);
}

/**
 * Used by other handlers to register a callback function to be called when the user sends a message
 */
export function registerInputCallback(user: HennosUser, callback: InputCallbackFunction) {
    InputCallbackFunctionMap.set(user.chatId, callback);
}

function chunkSubstr(str: string, size: number) {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);

    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }

    return chunks;
}

function hasGroupPrefix(entities: TelegramBot.MessageEntity[], text: string) {
    const mentions = entities.filter((entity) => entity.type === "mention");
    for (const mention of mentions) {
        // The substring here is the @mention, specifically with the @ sign.
        const substring = text.substring(mention.offset, mention.offset + mention.length);
        if (substring === `@${Config.TELEGRAM_GROUP_PREFIX}`) {
            Logger.debug(undefined, "hasGroupPrefix", { result: true });
            return true;
        }
    }

    Logger.debug(undefined, "hasGroupPrefix", { result: false });
    return false;
}

export function replaceTelegramBotName(text: string, replace: string, flags: string): string {
    const result = text.replace(new RegExp(`@?${Config.TELEGRAM_GROUP_PREFIX}`, flags), replace).trim();
    Logger.debug(undefined, "replaceTelegramBotName", { text, replace, result });
    return result;
}
