import TelegramBot from "node-telegram-bot-api";
import { Config } from "../singletons/config";
import { createWorkflowId, queryAgenticWorkflowContext, signalAgenticWorkflowExternalContext, signalAgenticWorkflowMessage } from "../temporal/agent/interface";
import { signalLegacyWorkflowMessage } from "../temporal/legacy/interface";
import { Logger } from "../singletons/logger";
import { handleDocument } from "../tools/FetchWebpageContent";
import { FILE_EXT_TO_READER } from "@llamaindex/readers/directory";
import path from "node:path";
import fs from "fs/promises";
import { generateTranscription } from "../singletons/transcription";
import { AgentResponseHandler } from "../response";
import { Database } from "../database";

export class TelegramInstance {
    private static _instance: TelegramBot | null = null;
    private static _errors: number = 0;

    static async init(): Promise<void> {
        Logger.info(undefined, "Starting Hennos Telegram Integration...");

        const bot = new TelegramBot(Config.TELEGRAM_BOT_KEY);
        if (Config.HENNOS_API_ENABLED && Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL) {
            Logger.info(undefined, `Starting Telegram Bot in Webhook mode: ${Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL}/bot${Config.TELEGRAM_BOT_KEY}`);

            // This is the external URL that Telegram will use to send updates to our webhook.
            bot.setWebHook(`${Config.TELEGRAM_BOT_WEBHOOK_EXTERNAL}/bot${Config.TELEGRAM_BOT_KEY}`);
        } else {
            Logger.info(undefined, "Starting Telegram Bot in Polling mode");
            bot.deleteWebHook();
            bot.startPolling();
        }

        TelegramInstance._instance = bot;

        Logger.debug(undefined, "Telegram bot initialized and polling started.");
        AgentResponseHandler.registerListener("telegram", async (message: string, chatId: string) => {
            try {
                await TelegramInstance.sendMessageWrapper(chatId, message);
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error("telegram", `Error sending message to chatId ${chatId}: ${error.message}`, error);
            }
        });

        AgentResponseHandler.registerArtifactListener("telegram", async (filePath: string, chatId: string, description?: string | undefined) => {
            try {
                await bot.sendDocument(Number(chatId), filePath, {
                    caption: description ? description.slice(0, 900) : `Artifact: ${path.basename(filePath)}`
                });
            } catch (err: unknown) {
                const error = err as Error;
                Logger.error("telegram", `Error sending document to chatId ${chatId}: ${error.message}`, error);
            }
        });

        bot.on("text", TelegramInstance.handleTextMessage);
        bot.on("location", TelegramInstance.handleLocationMessage);
        bot.on("contact", TelegramInstance.handleContactMessage);
        bot.on("audio", TelegramInstance.handleAudioMessage);
        bot.on("photo", TelegramInstance.handlePhotoMessage);
        bot.on("document", TelegramInstance.handleDocumentMessage);
        bot.on("voice", TelegramInstance.handleVoiceMessage);
        bot.on("edited_message_caption", TelegramInstance.handleEditCaptionMessage);
        bot.on("edited_message_text", TelegramInstance.handleEditTextMessage);

        bot.on("polling_error", (error: Error) => {
            Logger.error(undefined, `Telegram polling error: ${error.message}`, error);
            TelegramInstance._errors++;

            // If we have more than 10 errors, exit the process to allow a restart
            if (TelegramInstance._errors > 10) {
                Logger.error(undefined, "Too many Telegram polling errors, exiting process to allow restart.");
                process.exit(1);
            }
        });

        Logger.debug(undefined, "Registered Telegram message handlers.");
    }

    private static async sendMessageWrapper(chatId: string, content: string, options: TelegramBot.SendMessageOptions = {}) {
        if (!content) {
            Logger.warn(chatId, "Attempted to send empty message content.");
            return;
        }

        if (!content.length) {
            Logger.warn(chatId, "Attempted to send message with zero length.");
            return;
        }

        if (content.length < 4000) {
            Logger.debug(chatId, `Sending Telegram message of length ${content.length}`);
            return TelegramInstance.sendTelegramMessageWithRetry(chatId, content, options);
        }


        const chunks = chunkSubstr(content, 4000);
        Logger.debug(chatId, `Message length ${content.length} exceeds 4000 characters, splitting into ${chunks.length} chunks.`);
        for (let i = 0; i < chunks.length; i++) {
            Logger.debug(chatId, `Sending chunk ${i + 1} of ${chunks.length}, length ${chunks[i].length}`);
            await TelegramInstance.sendTelegramMessageWithRetry(chatId, chunks[i], options);
        }
    }

    private static async sendTelegramMessageWithRetry(chatId: string, content: string, options: TelegramBot.SendMessageOptions) {
        const bot = TelegramInstance.instance();
        try {
            await bot.sendMessage(chatId, content, { ...options, parse_mode: "Markdown" });
        } catch (err1: unknown) {
            try {
                await bot.sendMessage(chatId, content, { ...options, parse_mode: undefined });
            } catch (err2: unknown) {
                const error1 = err1 as Error;
                const error2 = err2 as Error;
                Logger.error(chatId, `Failed 2x to send Telegram message. Err1=${error1.message}, Err2=${error2.message}`);
            }
        }
    }

    static instance(): TelegramBot {
        if (!TelegramInstance._instance) {
            throw new Error("TelegramInstance not initialized.");
        }
        return TelegramInstance._instance;
    }

    private static workflowSignalArguments(msg: TelegramBot.Message): { author: string; workflowId: string; } {
        return {
            author: msg.from!.last_name ? `${msg.from!.first_name} ${msg.from!.last_name}` : `${msg.from!.first_name}`,
            workflowId: createWorkflowId("telegram", String(msg.chat.id)),
        };
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

    private static async handleDocumentMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.document) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        const result = await TelegramInstance.downloadTelegramFile(workflowId, msg.document.file_id, Config.LOCAL_STORAGE(workflowId));
        if (!result) {
            Logger.error(workflowId, `Failed to download document with file_id: ${msg.document.file_id}`);
            return;
        }

        const ext = path.extname(result) ? path.extname(result).substring(1) : ".bin";
        if (ext === "mp3" || ext === "ogg" || ext === "wav" || ext === "flac" || ext === "oga" || ext === "m4a") {
            return TelegramInstance.handleAudioMessage({
                ...msg,
                audio: { file_id: msg.document.file_id, duration: -1, file_unique_id: msg.document.file_unique_id }
            });
        }

        if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp" || ext === "bmp" || ext === "tiff") {
            return TelegramInstance.handlePhotoMessage({
                ...msg,
                photo: [{ file_id: msg.document.file_id, file_unique_id: msg.document.file_unique_id, width: -1, height: -1 }]
            });
        }

        const reader = FILE_EXT_TO_READER[ext];
        if (!reader) {
            Logger.warn(workflowId, `No reader available for document with file_id: ${msg.document.file_id} and extension: ${ext}`);
            const payload = `<document><file_id>${msg.document.file_id}</file_id><file_name>${msg.document.file_name || ""}</file_name><mime_type>${msg.document.mime_type || ""}</mime_type><file_size>${msg.document.file_size || ""}</file_size><error>No reader available for document with file_id: ${msg.document.file_id} and extension: ${ext}</error></document>`;
            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
        }

        if (reader) {
            const summary = await handleDocument(workflowId, result, msg.document.file_unique_id, reader);
            const payload = `<document><file_id>${msg.document.file_id}</file_id><file_name>${msg.document.file_name || ""}</file_name><mime_type>${msg.document.mime_type || ""}</mime_type><file_size>${msg.document.file_size || ""}</file_size><summary>${summary}</summary></document>`;
            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
        }

        if (msg.caption) {
            return signalAgenticWorkflowMessage(workflowId, author, msg.caption);
        }
    }

    private static async handlePhotoMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.photo || msg.photo.length === 0) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        const largestPhoto = msg.photo.reduce((prev, current) => (prev.file_size && current.file_size && prev.file_size > current.file_size) ? prev : current);

        const result = await TelegramInstance.downloadTelegramFile(workflowId, largestPhoto.file_id, Config.LOCAL_STORAGE(workflowId));
        if (result) {
            const payload = `<photo><file_id>${largestPhoto.file_id}</file_id><width>${largestPhoto.width}</width><height>${largestPhoto.height}</height><file_size>${largestPhoto.file_size || ""}</file_size><caption>${msg.caption || ""}</caption></photo>`;
            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
        } else {
            Logger.error(workflowId, `Failed to download photo with file_id: ${largestPhoto.file_id}`);
        }

        const summary = "<not_implemented>Unsupported: Telegram Photo Messages</not_implemented>"; // TODO: Implement image support
        return signalAgenticWorkflowMessage(workflowId, author, summary);
    }

    private static async handleAudioMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.audio) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);

        const result = await TelegramInstance.downloadTelegramFile(workflowId, msg.audio.file_id, Config.LOCAL_STORAGE(workflowId));
        if (!result) {
            Logger.error(workflowId, `Failed to download audio with file_id: ${msg.audio.file_id}`);
            return;
        }

        const transcript = await generateTranscription(workflowId, result);
        const payload = `<audio><file_id>${msg.audio.file_id}</file_id><duration>${msg.audio.duration}</duration><performer>${msg.audio.performer || ""}</performer><title>${msg.audio.title || ""}</title><mime_type>${msg.audio.mime_type || ""}</mime_type><file_size>${msg.audio.file_size || ""}</file_size><transcript>${transcript}</transcript></audio>`;
        await signalAgenticWorkflowExternalContext(workflowId, author, payload);

        if (msg.caption) {
            return signalAgenticWorkflowMessage(workflowId, author, msg.caption);
        }
    }

    private static async handleVoiceMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.voice) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);

        const result = await TelegramInstance.downloadTelegramFile(workflowId, msg.voice.file_id, Config.LOCAL_STORAGE(workflowId));
        if (!result) {
            Logger.error(workflowId, `Failed to download voice message with file_id: ${msg.voice.file_id}`);
            return;
        }

        const payload = `<voice><file_id>${msg.voice.file_id}</file_id><duration>${msg.voice.duration}</duration><mime_type>${msg.voice.mime_type || ""}</mime_type><file_size>${msg.voice.file_size || ""}</file_size></voice>`;
        await signalAgenticWorkflowExternalContext(workflowId, author, payload);

        const transcript = await generateTranscription(workflowId, result);
        return signalAgenticWorkflowMessage(workflowId, author, transcript);
    }

    private static async handleContactMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.contact) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        const payload = `<contact><first_name>${msg.contact.first_name}</first_name><last_name>${msg.contact.last_name || ""}</last_name><user_id>${msg.contact.user_id || ""}</user_id><vcard>${msg.contact.vcard || ""}</vcard><phone_number>${msg.contact.phone_number}</phone_number></contact>`;
        return signalAgenticWorkflowExternalContext(workflowId, author, payload);
    }

    private static async handleLocationMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.location) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        const payload = `<location><latitude>${msg.location.latitude}</latitude><longitude>${msg.location.longitude}</longitude></location>`;
        return signalAgenticWorkflowExternalContext(workflowId, author, payload);
    }

    private static async handleTextMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.text) {
            return;
        }

        // Check if this is a command
        if (msg.text.startsWith("/")) {
            return TelegramInstance.handleTextCommandMessage(msg);
        }

        // Check if the user is whitelisted in the database
        const isWhitelisted = await TelegramInstance.isUserWhitelisted(msg.from.id);

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        if (msg.forward_date) {
            const originaldate = new Date(msg.forward_date * 1000).toISOString();
            if (msg.forward_from) {
                const forwardUserName = msg.forward_from.last_name ? `${msg.forward_from.first_name} ${msg.forward_from.last_name}` : msg.forward_from.first_name;
                const payload = `<forwarded><original_date>${originaldate}</original_date><original_text>${msg.text}</original_text></forwarded>`;
                return signalAgenticWorkflowExternalContext(workflowId, forwardUserName, payload);
            }

            if (msg.forward_sender_name) {
                const payload = `<forwarded><original_date>${originaldate}</original_date><original_text>${msg.text}</original_text></forwarded>`;
                return signalAgenticWorkflowExternalContext(workflowId, msg.forward_sender_name, payload);
            }

            if (msg.forward_from_chat) {
                const payload = `<forwarded><original_date>${originaldate}</original_date><original_text>${msg.text}</original_text></forwarded>`;
                return signalAgenticWorkflowExternalContext(workflowId, msg.forward_from_chat.title || "Unknown Chat", payload);
            }
        }

        // Route to appropriate workflow based on whitelist status
        if (isWhitelisted) {
            return signalAgenticWorkflowMessage(workflowId, author, msg.text);
        } else {
            return signalLegacyWorkflowMessage(workflowId, author, msg.text);
        }
    }

    private static async handleEditTextMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.text) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        const payload = `<edited_message><edited_date>${new Date().toISOString()}</edited_date><new_text>${msg.text}</new_text></edited_message>`;
        return signalAgenticWorkflowExternalContext(workflowId, author, payload);
    }

    private static async handleEditCaptionMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.caption) {
            return;
        }

        const { author, workflowId } = TelegramInstance.workflowSignalArguments(msg);
        const payload = `<edited_caption><edited_date>${new Date().toISOString()}</edited_date><new_caption>${msg.caption}</new_caption></edited_caption>`;
        return signalAgenticWorkflowExternalContext(workflowId, author, payload);
    }

    private static async handleUnimplemented(event: string, msg: TelegramBot.Message): Promise<void> {
        Logger.debug(undefined, `Received unimplemented message type: ${event} with content: ${JSON.stringify(msg)}`);
    }

    private static async handleTextCommandMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.text) {
            return;
        }

        const command = msg.text.split(" ")[0].substring(1).toLowerCase().trim();
        Logger.debug(undefined, `Received Telegram command message: ${msg.text} from ${msg.from?.first_name} ${msg.from?.last_name || ""}`);
        if (command === "debug") {
            const { workflowId } = TelegramInstance.workflowSignalArguments(msg);
            const context = await queryAgenticWorkflowContext(workflowId);

            const filePath = path.join(Config.LOCAL_STORAGE(workflowId), `debug_context_${Date.now()}.xml`);
            await fs.writeFile(filePath, context.join("\n"), "utf-8");
            Logger.debug(undefined, `Workflow context written to ${filePath}`);
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