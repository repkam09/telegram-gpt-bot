import fs, { } from "node:fs";
import TelegramBot from "node-telegram-bot-api";
import mimetype from "mime-types";
import { Config } from "./config";
import { Logger } from "./logger";
import { handleDocumentMessage } from "../handlers/document";
import { handleImageMessage } from "../handlers/photos";
import { handleVoiceMessage } from "../handlers/voice";
import { handleVoiceSettingsCallback } from "../handlers/text/commands/handleVoiceSettings";
import { handleGeneralSettingsCallback } from "../handlers/text/commands/handleGeneralSettings";
import { handlePrivateMessage } from "../handlers/text/private";
import { handleWhitelistedGroupMessage } from "../handlers/text/group";
import { handleCommandMessage } from "../handlers/text/commands";
import { HennosUser, HennosUserAsync } from "./user";
import { HennosGroup, HennosGroupAsync } from "./group";
import { handleLLMProviderSettingsCallback } from "../handlers/text/commands/handleLLMProviderSettings";
import path from "node:path";
import { HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";

type InputCallbackFunction = (msg: TelegramBot.Message) => Promise<void> | void
type MessageWithText = TelegramBot.Message & { text: string }

const InputCallbackFunctionMap = new Map<number, InputCallbackFunction>();
const PendingChatMap = new Map<number, string[]>();
const PendingChatTimerMap = new Map<number, NodeJS.Timeout>();

export class BotInstance {
    static _instance: TelegramBot;

    static instance(): TelegramBot {
        if (!BotInstance._instance) {
            BotInstance._instance = new TelegramBot(Config.TELEGRAM_BOT_KEY, { polling: true });
        }

        return BotInstance._instance;
    }

    static async sendMessageWrapper(user: HennosConsumer, content: string, options: TelegramBot.SendMessageOptions = {}) {
        if (!content) {
            throw new Error("Message content is undefined");
        }

        if (!content.length) {
            throw new Error("Message content does not have a length property");
        }

        if (content.length < 4096) {
            return BotInstance.sendTelegramMessageWithRetry(user, content, options);
        }

        const chunks = chunkSubstr(content, 4096);
        for (let i = 0; i < chunks.length; i++) {
            return BotInstance.sendTelegramMessageWithRetry(user, chunks[i], options);
        }
    }

    static async sendVoiceMemoWrapper(chatId: number, content: Buffer, options: TelegramBot.SendVoiceOptions = {}): Promise<void> {
        if (!content) {
            throw new Error("Message content is undefined");
        }

        if (!content.length) {
            throw new Error("Message content does not have a length property");
        }

        const bot = BotInstance.instance();
        await bot.sendVoice(chatId, content, options);
    }

    static async sendAdminMessage(content: string) {
        if (Config.TELEGRAM_BOT_ADMIN !== -1 && !Config.HENNOS_DEVELOPMENT_MODE) {
            await BotInstance.instance().sendMessage(Config.TELEGRAM_BOT_ADMIN, content, {});
        }
    }

    static async sendTelegramMessageWithRetry(user: HennosConsumer, content: string, options: TelegramBot.SendMessageOptions) {
        const bot = BotInstance.instance();
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
        BotInstance.instance().sendChatAction(req.chatId, action).catch((err: unknown) => {
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
        BotInstance.instance().setMessageReaction(req.chatId, msg.message_id, options).then(() => {
            Logger.debug(`Set reaction on Telegram message ${msg.message_id} for user ${req.displayName}`);
        }).catch((err: unknown) => {
            Logger.error(req, `Error while setting reaction on Telegram message ${msg.message_id}: `, err);
        });
    }

    static init() {
        const bot = BotInstance.instance();
        bot.on("text", async (msg) => {
            if (!msg.from || !msg.text) {
                return;
            }

            const user = await HennosUserAsync(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
            if (Config.HENNOS_DEVELOPMENT_MODE) {
                if (msg.from.id !== Config.TELEGRAM_BOT_ADMIN) {
                    Logger.warn(user, "Ignoring message from non-admin user due to HENNOS_DEVELOPMENT_MODE true");
                    return;
                }
            }

            if (msg.text.startsWith("/")) {
                Logger.trace(user, "text_command");
                return handleTelegramCommandMessage(user, msg as MessageWithText);
            }

            if (msg.chat.type !== "private") {
                const group = await HennosGroupAsync(msg.chat.id, msg.chat.title);
                return handleTelegramGroupMessage(user, group, msg as MessageWithText);
            }

            if (msg.chat.type === "private") {
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
                const user = await HennosUserAsync(query.from.id, query.from.first_name, query.from.last_name, query.from.username);

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
    BotInstance.setTelegramIndicator(group, "typing");
    const response = await handleWhitelistedGroupMessage(user, group, msg.text.replace(Config.TELEGRAM_GROUP_PREFIX, ""));
    await BotInstance.sendMessageWrapper(group, response), { reply_to_message_id: msg.message_id };
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
        BotInstance.setTelegramIndicator(user, "typing");
        const response = await handlePrivateMessage(user, messages.length === 1 ? messages[0] : messages.join("\n"));

        // Send the response to the user
        await BotInstance.sendMessageWrapper(user, response);
    }, 2000);

    PendingChatTimerMap.set(user.chatId, timeout);
}

async function handleTelegramVoiceMessage(user: HennosUser, msg: TelegramBot.Message & { voice: TelegramBot.Voice }) {
    BotInstance.setTelegramIndicator(user, "typing");
    const tempFilePath = await BotInstance.instance().downloadFile(msg.voice.file_id, Config.LOCAL_STORAGE(user));
    const response = await handleVoiceMessage(user, tempFilePath);

    BotInstance.setTelegramIndicator(user, "record_voice");
    try {
        const arrayBuffer = await HennosOpenAISingleton.instance().speech(user, response);
        if (arrayBuffer) {
            BotInstance.setTelegramIndicator(user, "upload_voice");
            await BotInstance.sendVoiceMemoWrapper(user.chatId, Buffer.from(arrayBuffer));
        }
    } catch (err) {
        Logger.error(user, "handleTelegramVoiceMessage unable to process LLM response into speech.", err);
    }

    return BotInstance.sendMessageWrapper(user, response);
}

async function handleTelegramPhotoMessage(user: HennosUser, msg: TelegramBot.Message & { photo: TelegramBot.PhotoSize[] }) {
    const largestImage = msg.photo.reduce((max, obj) => {
        return (obj.width * obj.height > max.width * max.height) ? obj : max;
    });

    BotInstance.setTelegramIndicator(user, "upload_photo");
    const tempFileUrl = await BotInstance.instance().getFileLink(largestImage.file_id);
    const tempFilePath = await BotInstance.instance().downloadFile(largestImage.file_id, Config.LOCAL_STORAGE(user));
    const mime_type = mimetype.contentType(path.extname(tempFilePath));

    BotInstance.setTelegramIndicator(user, "typing");
    const response = await handleImageMessage(user, { remote: tempFileUrl, local: tempFilePath, mime: mime_type || "application/octet-stream" }, msg.caption);
    return BotInstance.sendMessageWrapper(user, response);
}

async function handleTelegramLocationMessage(user: HennosUser, msg: TelegramBot.Message & { location: TelegramBot.Location }) {
    BotInstance.setTelegramIndicator(user, "find_location");
    await user.updateLocation(msg.location.latitude, msg.location.longitude);
    return BotInstance.sendMessageWrapper(user, "Thanks! I will take your location into account in the future.");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleTelegramAudioMessage(user: HennosUser, msg: TelegramBot.Message & { audio: TelegramBot.Audio }) {
    BotInstance.setTelegramIndicator(user, "typing");
    return BotInstance.sendMessageWrapper(user, "Error: Audio messages are not yet supported");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleTelegramContactMessage(user: HennosUser, msg: TelegramBot.Message & { audio: TelegramBot.Audio }) {
    BotInstance.setTelegramIndicator(user, "typing");
    return BotInstance.sendMessageWrapper(user, "Error: Contacts are not supported yet.");
}

async function handleTelegramDocumentMessage(user: HennosUser, msg: TelegramBot.Message & { document: TelegramBot.Document }) {
    BotInstance.setTelegramMessageReact(user, msg, "👀");
    const tempFilePath = await BotInstance.instance().downloadFile(msg.document.file_id, Config.LOCAL_STORAGE(user));
    const ext = path.extname(tempFilePath) ? path.extname(tempFilePath).substring(1) : ".bin";

    const response = await handleDocumentMessage(user, tempFilePath, ext, msg.document.file_unique_id);

    await user.updateChatContext("user", "I just uploaded a document. Could you provide a summary of it?");
    await user.updateChatContext("assistant", response);

    BotInstance.setTelegramMessageReact(user, msg);
    return BotInstance.sendMessageWrapper(user, response);
}

async function handleTelegramStickerMessage(msg: TelegramBot.Message & { sticker: TelegramBot.Sticker }) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.sticker) {
        return;
    }

    const user = await HennosUserAsync(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
    Logger.trace(user, "sticker");

    const { set_name, emoji } = msg.sticker;
    if (set_name && emoji) {
        return;
    }

    try {
        const stickerPath = await BotInstance.instance().downloadFile(msg.sticker.file_id, Config.LOCAL_STORAGE(user));
        await BotInstance.instance().sendPhoto(chatId, fs.createReadStream(stickerPath), { reply_to_message_id: msg.message_id, caption: "Here, I RepBig'd that for you!" }, { contentType: "image/webp" });
    } catch (err) {
        const user = await HennosUserAsync(msg.from.id, msg.from.first_name, msg.from.last_name, msg.from.username);
        Logger.error(user, err);
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateIncomingMessage(msg: unknown, requiredProperty: keyof TelegramBot.Message, handler: (user: HennosUser, msg: any) => Promise<void>): Promise<void> {
    const message = msg as TelegramBot.Message;
    if (message.chat.type !== "private" || !message.from) {
        return;
    }

    const user = await HennosUserAsync(message.from.id, message.from.first_name, message.from.last_name, message.from.username);
    if (Config.HENNOS_DEVELOPMENT_MODE) {
        if (message.from.id !== Config.TELEGRAM_BOT_ADMIN) {
            Logger.warn(user, "Ignoring message from non-admin user due to HENNOS_DEVELOPMENT_MODE true");
            return;
        }
    }

    if (!message[requiredProperty]) {
        return;
    }

    if (!user.whitelisted) {
        Logger.trace(user, `${requiredProperty} [but not whitelisted]`);
        return BotInstance.sendMessageWrapper(user, "Sorry, you have not been whitelisted to use this feature.");
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