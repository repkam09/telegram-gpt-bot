import fs, { } from "node:fs";
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
import { handleWhitelistedGroupMessage } from "../../handlers/text/group";
import { handleCommandGroupMessage, handleCommandMessage } from "./commands";
import { HennosUser } from "../../singletons/user";
import { HennosGroup } from "../../singletons/group";
import { handleLLMProviderSettingsCallback } from "./commands/handleLLMProviderSettings";
import path from "node:path";
import { HennosConsumer } from "../../singletons/base";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { handleCalendarImport } from "../../tools/ImportCalendar";

type InputCallbackFunction = (msg: TelegramBot.Message) => Promise<void> | void
type MessageWithText = TelegramBot.Message & { text: string }

const InputCallbackFunctionMap = new Map<number, InputCallbackFunction>();
const PendingChatMap = new Map<number, string[]>();
const PendingChatTimerMap = new Map<number, NodeJS.Timeout>();

export class TelegramBotInstance {
    static _instance: TelegramBot;

    static instance(): TelegramBot {
        if (!TelegramBotInstance._instance) {
            TelegramBotInstance._instance = new TelegramBot(Config.TELEGRAM_BOT_KEY, { polling: true });
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

    static async sendVoiceMemoWrapper(chatId: number, content: Buffer, options: TelegramBot.SendVoiceOptions = {}): Promise<void> {
        if (!content) {
            throw new Error("Message content is undefined");
        }

        if (!content.length) {
            throw new Error("Message content does not have a length property");
        }

        const bot = TelegramBotInstance.instance();
        await bot.sendVoice(chatId, content, options);
    }

    static async sendAdminMessage(content: string) {
        if (Config.TELEGRAM_BOT_ADMIN !== -1 && !Config.HENNOS_DEVELOPMENT_MODE) {
            await TelegramBotInstance.instance().sendMessage(Config.TELEGRAM_BOT_ADMIN, content, {});
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

    static setTelegramMessageReact(req: HennosConsumer, msg: TelegramBot.Message, emote?: string): void {
        const options = {
            reaction: emote ? [{
                type: "emoji",
                emoji: emote
            }] : []
        };

        // @ts-expect-error - The Types are wrong for the bot instance, it does support setMessageReaction 
        TelegramBotInstance.instance().setMessageReaction(req.chatId, msg.message_id, options).then(() => {
            Logger.debug(`Set reaction on Telegram message ${msg.message_id} for user ${req.displayName}`);
        }).catch((err: unknown) => {
            Logger.error(req, `Error while setting reaction on Telegram message ${msg.message_id}: `, err);
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

                // Check if this is a command sent in a group chat
                if (msg.text.startsWith(`${Config.TELEGRAM_GROUP_PREFIX}/`)) {
                    Logger.trace(user, `text_command: ${msg.text}`);
                    return handleTelegramCommandGroupMessage(user, group, msg as MessageWithText);
                }

                // If the user has experimental features enabled, also enable for the group request
                if (user.experimental) {
                    Logger.debug("User has experimental features enabled, enabling for group");
                    group.experimental = true;
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
    const converted = msg.text.replace(`${Config.TELEGRAM_GROUP_PREFIX}`, "").trim();
    return handleCommandGroupMessage(user, group, converted);
}

async function handleTelegramCommandMessage(user: HennosUser, msg: MessageWithText) {
    return handleCommandMessage(user, msg);
}

async function handleTelegramGroupMessage(user: HennosUser, group: HennosGroup, msg: MessageWithText): Promise<void> {
    // Check if the user @'d the bot in their message
    if (!msg.text.startsWith(Config.TELEGRAM_GROUP_PREFIX)) {
        return;
    }

    Logger.trace(user, "text_group");

    if (!group.whitelisted && !user.whitelisted) {
        return;
    }

    // If the user did @ the bot, strip out that @ prefix before processing the message
    TelegramBotInstance.setTelegramIndicator(group, "typing");
    const response = await handleWhitelistedGroupMessage(user, group, msg.text.replace(Config.TELEGRAM_GROUP_PREFIX, ""));
    await TelegramBotInstance.sendMessageWrapper(group, response), { reply_to_message_id: msg.message_id };
}

async function handleTelegramPrivateMessage(user: HennosUser, msg: MessageWithText) {
    // Reset the time between messages timer
    clearTimeout(PendingChatTimerMap.get(user.chatId));

    // Check if we have other messages in the map
    const current = PendingChatMap.get(user.chatId) || [];
    current.push(msg.text);
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
        await TelegramBotInstance.sendMessageWrapper(user, response);
    }, 2000);

    PendingChatTimerMap.set(user.chatId, timeout);
}

async function handleTelegramVoiceMessage(req: HennosConsumer, msg: TelegramBot.Message & { voice: TelegramBot.Voice }) {
    if (req instanceof HennosGroup) {
        return TelegramBotInstance.sendMessageWrapper(req, "Voice messages are not supported for groups at this time.");
    }

    const user = req as HennosUser;

    TelegramBotInstance.setTelegramIndicator(user, "typing");
    const tempFilePath = await TelegramBotInstance.instance().downloadFile(msg.voice.file_id, Config.LOCAL_STORAGE(user));
    const response = await handleVoiceMessage(user, tempFilePath);

    TelegramBotInstance.setTelegramIndicator(user, "record_voice");
    try {
        const arrayBuffer = await HennosOpenAISingleton.instance().speech(user, response);
        if (arrayBuffer) {
            TelegramBotInstance.setTelegramIndicator(user, "upload_voice");
            await TelegramBotInstance.sendVoiceMemoWrapper(user.chatId, Buffer.from(arrayBuffer));
        }
    } catch (err) {
        Logger.error(user, "handleTelegramVoiceMessage unable to process LLM response into speech.", err);
    }

    return TelegramBotInstance.sendMessageWrapper(user, response);
}

async function handleTelegramPhotoMessage(req: HennosConsumer, msg: TelegramBot.Message & { photo: TelegramBot.PhotoSize[] }) {
    const largestImage = msg.photo.reduce((max, obj) => {
        return (obj.width * obj.height > max.width * max.height) ? obj : max;
    });

    TelegramBotInstance.setTelegramIndicator(req, "upload_photo");
    const tempFileUrl = await TelegramBotInstance.instance().getFileLink(largestImage.file_id);
    const tempFilePath = await TelegramBotInstance.instance().downloadFile(largestImage.file_id, Config.LOCAL_STORAGE(req));
    const mime_type = mimetype.contentType(path.extname(tempFilePath));

    TelegramBotInstance.setTelegramIndicator(req, "typing");
    const response = await handleImageMessage(req, { remote: tempFileUrl, local: tempFilePath, mime: mime_type || "application/octet-stream" }, msg.caption);
    return TelegramBotInstance.sendMessageWrapper(req, response);
}

async function handleTelegramLocationMessage(req: HennosConsumer, msg: TelegramBot.Message & { location: TelegramBot.Location }) {
    if (req instanceof HennosGroup) {
        return TelegramBotInstance.sendMessageWrapper(req, "Location sharing is not supported for groups at this time.");
    }
    const user = req as HennosUser;
    TelegramBotInstance.setTelegramIndicator(req, "find_location");
    await user.updateLocation(msg.location.latitude, msg.location.longitude);
    return TelegramBotInstance.sendMessageWrapper(user, "Location information updated.");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleTelegramAudioMessage(req: HennosConsumer, msg: TelegramBot.Message & { audio: TelegramBot.Audio }) {
    TelegramBotInstance.setTelegramIndicator(req, "typing");
    return TelegramBotInstance.sendMessageWrapper(req, "Error: Audio messages are not yet supported");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleTelegramContactMessage(req: HennosConsumer, msg: TelegramBot.Message & { audio: TelegramBot.Audio }) {
    TelegramBotInstance.setTelegramIndicator(req, "typing");
    return TelegramBotInstance.sendMessageWrapper(req, "Error: Contacts are not supported yet.");
}

async function handleTelegramCalendarMessage(req: HennosConsumer, file: string) {
    try {
        const result = await handleCalendarImport(req, file);
        if (result) {
            await req.updateChatContext("user", "I just uploaded an ICS calendar file. Could you import those events into our chat context?");
            await req.updateChatContext("assistant", `Calendar imported successfully. Here are the events I found: ${JSON.stringify(result)}`);
            return TelegramBotInstance.sendMessageWrapper(req, "Calendar imported successfully.");
        } else {
            return TelegramBotInstance.sendMessageWrapper(req, "An error occured while processing your calendar.");
        }
    } catch (err) {
        Logger.error(req, "Error while processing calendar import", err);
        return TelegramBotInstance.sendMessageWrapper(req, "An error occured while processing your calendar.");
    }
}

async function handleTelegramDocumentMessage(req: HennosConsumer, msg: TelegramBot.Message & { document: TelegramBot.Document }) {
    TelegramBotInstance.setTelegramMessageReact(req, msg, "👀");
    const tempFilePath = await TelegramBotInstance.instance().downloadFile(msg.document.file_id, Config.LOCAL_STORAGE(req));
    const ext = path.extname(tempFilePath) ? path.extname(tempFilePath).substring(1) : ".bin";


    if (ext === "ics") {
        return handleTelegramCalendarMessage(req, tempFilePath);
    }

    const response = await handleDocumentMessage(req, tempFilePath, ext, msg.document.file_unique_id);
    await req.updateChatContext("user", "I just uploaded a document. Could you provide a summary of it?");
    await req.updateChatContext("assistant", response);

    TelegramBotInstance.setTelegramMessageReact(req, msg);
    return TelegramBotInstance.sendMessageWrapper(req, response);
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
        const stickerPath = await TelegramBotInstance.instance().downloadFile(msg.sticker.file_id, Config.LOCAL_STORAGE(user));
        await TelegramBotInstance.instance().sendPhoto(chatId, fs.createReadStream(stickerPath), { reply_to_message_id: msg.message_id, caption: "Here, I RepBig'd that for you!" }, { contentType: "image/webp" });
    } catch (err) {
        const user = await HennosUser.async(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
        Logger.error(user, err);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateIncomingMessage(msg: unknown, requiredProperty: keyof TelegramBot.Message, handler: (req: HennosConsumer, msg: any) => Promise<void>): Promise<void> {
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