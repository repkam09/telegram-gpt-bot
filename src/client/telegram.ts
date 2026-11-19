import TelegramBot, { Message, SendMessageParams } from "node-telegram-bot-api";
import { Config } from "../singletons/config";
import { createWorkflowId } from "../temporal/legacy/interface";
import { Logger } from "../singletons/logger";
import path from "node:path";
import { createReadStream } from "node:fs";
import { Database } from "../database";
import { TelegramLegacyInstance } from "./legacy/legacy";

const TelegramStatusEvents: string[] = ["typing", "upload_photo", "record_video", "upload_video", "record_voice", "upload_voice", "upload_document", "find_location", "record_video_note", "upload_video_note"] as const;


type ChatAction = typeof TelegramStatusEvents[number];
type SendMessageOptions = Omit<SendMessageParams, "chat_id" | "text">;

export class TelegramInstance {
    private static _instance: TelegramBot | null = null;
    private static _errors: number = 0;

    static async init(): Promise<void> {
        if (TelegramInstance._instance) {
            Logger.warn("telegram", "Telegram bot is already initialized.");
            return;
        }
        Logger.info("telegram", "Starting Hennos Telegram Integration...");

        const bot = new TelegramBot(Config.TELEGRAM_BOT_KEY);
        if (Config.HENNOS_API_ENABLED && Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL) {
            Logger.info("telegram", `Starting Telegram Bot in Webhook mode: ${Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL}/bot${Config.TELEGRAM_BOT_KEY}`);

            // This is the external URL that Telegram will use to send updates to our webhook.
            bot.setWebHook(`${Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL}/bot${Config.TELEGRAM_BOT_KEY}`);
        } else {
            Logger.info("telegram", "Starting Telegram Bot in Polling mode");
            bot.deleteWebHook();
            bot.startPolling();
        }

        TelegramInstance._instance = bot;

        Logger.debug("telegram", "Telegram bot initialized and polling started.");
        bot.on("text", (msg) => TelegramInstance.validateWhitelist(msg, TelegramInstance.handleTextMessage));
        bot.on("location", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleLocationMessage));
        bot.on("contact", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleContactMessage));
        bot.on("audio", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleAudioMessage));
        bot.on("photo", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handlePhotoMessage));
        bot.on("document", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleDocumentMessage));
        bot.on("voice", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleVoiceMessage));
        bot.on("edited_message_caption", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleLegacyNoOpMessage));
        bot.on("edited_message_text", (msg) => TelegramInstance.validateWhitelist(msg, TelegramLegacyInstance.handleLegacyNoOpMessage));

        // Special case for stickers, since we want to attempt to re-upload them as photos if they are sent as stickers, no whitelist check
        bot.on("sticker", TelegramInstance.handleTelegramStickerMessage);

        bot.on("polling_error", (error: Error) => {
            Logger.error("telegram", `Telegram polling error: ${error.message}`, error);
            TelegramInstance._errors++;

            // If we have more than 10 errors, exit the process to allow a restart
            if (TelegramInstance._errors > 10) {
                Logger.error("telegram", "Too many Telegram polling errors, exiting process to allow restart.");
                process.exit(1);
            }
        });

        Logger.debug("telegram", "Registered Telegram message handlers.");
    }

    static setTelegramIndicator(chatId: number, action: ChatAction): void {
        TelegramInstance.instance().sendChatAction(chatId, action).catch((err: unknown) => {
            Logger.warn("telegram", `Error while setting Telegram status indicator ${action} for chatId ${chatId}: ${err}`);
        });
    }

    private static async validateWhitelist(msg: Message, handler: (msg: Message) => Promise<void>): Promise<void> {
        if (!msg.from) {
            return;
        }

        if (Config.HENNOS_DEVELOPMENT_MODE) {
            Logger.debug("telegram", `Development mode enabled, skipping whitelist check for user ${msg.from.id}`);
            return handler(msg);
        }

        // Check if the user is whitelisted in the database
        const isWhitelisted = await TelegramInstance.isUserWhitelisted(msg.from.id);
        if (!isWhitelisted) {
            Logger.debug("telegram", `User ${msg.from.id} is not whitelisted`);
            return;
        }

        return handler(msg);
    }

    public static async sendMessageWrapper(chatId: string, content: string, options: SendMessageOptions = {}) {
        if (!content) {
            Logger.warn("telegram", `Attempted to send empty message content to chatId ${chatId}.`);
            return;
        }

        if (!content.length) {
            Logger.warn("telegram", `Attempted to send message with zero length to chatId ${chatId}.`);
            return;
        }

        if (content.length < 4000) {
            Logger.debug("telegram", `Sending Telegram message of length ${content.length} to chatId ${chatId}`);
            return TelegramInstance.sendTelegramMessageWithRetry(chatId, content, options);
        }


        const chunks = chunkSubstr(content, 4000);
        Logger.debug("telegram", `Message length ${content.length} exceeds 4000 characters, splitting into ${chunks.length} chunks.`);
        for (let i = 0; i < chunks.length; i++) {
            Logger.debug("telegram", `Sending chunk ${i + 1} of ${chunks.length}, length ${chunks[i].length} to chatId ${chatId}`);
            await TelegramInstance.sendTelegramMessageWithRetry(chatId, chunks[i], options);
        }
    }

    private static async sendTelegramMessageWithRetry(chatId: string, content: string, options: SendMessageOptions) {
        const bot = TelegramInstance.instance();
        try {
            await bot.sendMessage(chatId, content, { ...options, parse_mode: "Markdown" });
        } catch (err1: unknown) {
            try {
                await bot.sendMessage(chatId, content, { ...options, parse_mode: undefined });
            } catch (err2: unknown) {
                const error1 = err1 as Error;
                const error2 = err2 as Error;
                Logger.error("telegram", `Failed 2x to send Telegram message to chatId ${chatId}. Err1=${error1.message}, Err2=${error2.message}`);
            }
        }
    }

    static instance(): TelegramBot {
        if (!TelegramInstance._instance) {
            throw new Error("TelegramInstance not initialized.");
        }
        return TelegramInstance._instance;
    }

    private static async isUserWhitelisted(userId: number): Promise<boolean> {
        const db = Database.instance();
        const user = await db.user.findUnique({
            where: { chatId: BigInt(userId) },
            select: { whitelisted: true }
        });
        return user?.whitelisted ?? false;
    }

    private static async downloadTelegramFile(workflowId: string, fileId: string, downloadPath: string): Promise<string | null> {
        const bot = TelegramInstance.instance();
        try {
            const telegramFileInfo = await bot.getFile(fileId);
            if (telegramFileInfo.file_path) {
                Logger.debug(workflowId, `Downloading file from Telegram - ${telegramFileInfo.file_id}, ${telegramFileInfo.file_path}, ${telegramFileInfo.file_size}`);
            }

            const file = await bot.downloadFile(fileId, downloadPath);
            return file;
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `Error downloading file from Telegram: ${error.message}`, error);
        }
        return null;
    }

    private static async handleTextMessage(msg: Message): Promise<void> {
        if (!msg.from || !msg.text) {
            return;
        }

        if (msg.text.startsWith("/")) {
            return TelegramLegacyInstance.handleTextCommandMessage(msg);
        }

        return TelegramLegacyInstance.handleTextMessage(msg);
    }

    private static async handleTelegramStickerMessage(msg: Message) {
        const chatId = msg.chat.id;
        if (!msg.from || !msg.sticker) {
            return;
        }

        const workflowId = createWorkflowId("legacy", String(msg.chat.id));

        const { set_name, emoji } = msg.sticker;
        if (set_name && emoji) {
            return;
        }

        try {
            // This is a silly feature that fixes an issue in Telegram where some images are incorrectly sent as stickers
            // This will download the sticker, and re-upload it as a photo
            const stickerPath = await TelegramInstance.downloadTelegramFile(workflowId, msg.sticker.file_id, Config.LOCAL_STORAGE(String(msg.chat.id)));
            if (!stickerPath) {
                return;
            }

            await TelegramInstance.instance().sendPhoto(chatId, createReadStream(stickerPath), { reply_parameters: { message_id: msg.message_id }, caption: "Here, I RepBig'd that for you!" }, { contentType: "image/webp" });
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            Logger.error(workflowId, `Error handling Telegram sticker message with file_id: ${msg.sticker.file_id}.`, error);
        }
    }
}

function chunkSubstr(str: string, size: number) {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);

    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }

    return chunks;
}