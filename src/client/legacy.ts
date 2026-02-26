import path from "node:path";
import mimetype from "mime-types";
import TelegramBot from "node-telegram-bot-api";
import { createWorkflowId, signalLegacyWorkflowExternalContext, signalLegacyWorkflowImageMessage, signalLegacyWorkflowMessage } from "../temporal/legacy/interface";
import { TelegramInstance } from "./telegram";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { FILE_EXT_TO_READER } from "@llamaindex/readers/directory";
import { handleDocument } from "../tools/FetchWebpageContent";
import { generateTranscription } from "../singletons/transcription";



export class TelegramLegacyInstance {
    public static async handleDocumentMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.document) {
            return;
        }

        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);
        const result = await TelegramLegacyInstance.downloadTelegramFile(workflowId, msg.document.file_id, Config.LOCAL_STORAGE(String(msg.chat.id)));
        if (!result) {
            Logger.error(workflowId, `Failed to download document with file_id: ${msg.document.file_id}`);
            return;
        }

        const ext = path.extname(result) ? path.extname(result).substring(1) : ".bin";
        if (ext === "mp3" || ext === "ogg" || ext === "wav" || ext === "flac" || ext === "oga" || ext === "m4a") {
            return TelegramLegacyInstance.handleAudioMessage({
                ...msg,
                audio: { file_id: msg.document.file_id, duration: -1, file_unique_id: msg.document.file_unique_id }
            });
        }

        if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp" || ext === "bmp" || ext === "tiff") {
            return TelegramLegacyInstance.handlePhotoMessage({
                ...msg,
                photo: [{ file_id: msg.document.file_id, file_unique_id: msg.document.file_unique_id, width: -1, height: -1 }]
            });
        }

        const reader = FILE_EXT_TO_READER[ext];
        if (!reader) {
            Logger.warn(workflowId, `No reader available for document with file_id: ${msg.document.file_id} and extension: ${ext}`);
            const payload = `<document><file_id>${msg.document.file_id}</file_id><file_name>${msg.document.file_name || ""}</file_name><mime_type>${msg.document.mime_type || ""}</mime_type><file_size>${msg.document.file_size || ""}</file_size><error>No reader available for document with file_id: ${msg.document.file_id} and extension: ${ext}</error></document>`;
            await signalLegacyWorkflowExternalContext(workflowId, author, payload);
        }

        if (reader) {
            const summary = await handleDocument(workflowId, result, msg.document.file_unique_id, reader);
            const payload = `<document><file_id>${msg.document.file_id}</file_id><file_name>${msg.document.file_name || ""}</file_name><mime_type>${msg.document.mime_type || ""}</mime_type><file_size>${msg.document.file_size || ""}</file_size><summary>${summary}</summary></document>`;
            await signalLegacyWorkflowExternalContext(workflowId, author, payload);
        }

        if (msg.caption) {
            return signalLegacyWorkflowMessage(workflowId, author, msg.caption);
        }

    }

    public static async handlePhotoMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.photo || msg.photo.length === 0) {
            return;
        }

        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);
        const largestPhoto = msg.photo.reduce((prev, current) => (prev.file_size && current.file_size && prev.file_size > current.file_size) ? prev : current);

        const result = await TelegramLegacyInstance.downloadTelegramFile(workflowId, largestPhoto.file_id, Config.LOCAL_STORAGE(String(msg.chat.id)));
        if (!result) {
            Logger.error(workflowId, `Failed to download photo with file_id: ${largestPhoto.file_id}`);
            return;
        }

        const mime_type = mimetype.contentType(path.extname(result));
        await signalLegacyWorkflowImageMessage(workflowId, author, result, mime_type || "application/octet-stream");

        if (msg.caption) {
            await signalLegacyWorkflowMessage(workflowId, author, msg.caption);
        }
    }

    public static async handleAudioMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.audio) {
            return;
        }


        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);

        const result = await TelegramLegacyInstance.downloadTelegramFile(workflowId, msg.audio.file_id, Config.LOCAL_STORAGE(String(msg.chat.id)));
        if (!result) {
            Logger.error(workflowId, `Failed to download audio with file_id: ${msg.audio.file_id}`);
            return;
        }

        const transcript = await generateTranscription(workflowId, result);
        const payload = `<audio><file_id>${msg.audio.file_id}</file_id><duration>${msg.audio.duration}</duration><performer>${msg.audio.performer || ""}</performer><title>${msg.audio.title || ""}</title><mime_type>${msg.audio.mime_type || ""}</mime_type><file_size>${msg.audio.file_size || ""}</file_size><transcript>${transcript}</transcript></audio>`;
        await signalLegacyWorkflowExternalContext(workflowId, author, payload);

        if (msg.caption) {
            return signalLegacyWorkflowMessage(workflowId, author, msg.caption);
        }
    }

    public static async handleVoiceMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.voice) {
            return;
        }


        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);

        const result = await TelegramLegacyInstance.downloadTelegramFile(workflowId, msg.voice.file_id, Config.LOCAL_STORAGE(String(msg.chat.id)));
        if (!result) {
            Logger.error(workflowId, `Failed to download voice message with file_id: ${msg.voice.file_id}`);
            return;
        }

        const payload = `<voice><file_id>${msg.voice.file_id}</file_id><duration>${msg.voice.duration}</duration><mime_type>${msg.voice.mime_type || ""}</mime_type><file_size>${msg.voice.file_size || ""}</file_size></voice>`;
        await signalLegacyWorkflowExternalContext(workflowId, author, payload);

        const transcript = await generateTranscription(workflowId, result);
        return signalLegacyWorkflowMessage(workflowId, author, transcript);
    }

    public static async handleContactMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.contact) {
            return;
        }

        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);
        const payload = `<contact><first_name>${msg.contact.first_name}</first_name><last_name>${msg.contact.last_name || ""}</last_name><user_id>${msg.contact.user_id || ""}</user_id><vcard>${msg.contact.vcard || ""}</vcard><phone_number>${msg.contact.phone_number}</phone_number></contact>`;
        return signalLegacyWorkflowExternalContext(workflowId, author, payload);
    }


    public static async handleLocationMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.location) {
            return;
        }

        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);
        const payload = `<location><latitude>${msg.location.latitude}</latitude><longitude>${msg.location.longitude}</longitude></location>`;
        return signalLegacyWorkflowExternalContext(workflowId, author, payload);
    }

    public static async handleTextMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.text) {
            return;
        }

        const { author, workflowId } = await TelegramLegacyInstance.workflowLegacySignalArguments(msg);
        if (msg.forward_date) {
            const originaldate = new Date(msg.forward_date * 1000).toISOString();
            if (msg.forward_from) {
                const forwardUserName = msg.forward_from.last_name ? `${msg.forward_from.first_name} ${msg.forward_from.last_name}` : msg.forward_from.first_name;
                const payload = `<forwarded><original_date>${originaldate}</original_date><original_text>${msg.text}</original_text></forwarded>`;
                return signalLegacyWorkflowExternalContext(workflowId, forwardUserName, payload);
            }

            if (msg.forward_sender_name) {
                const payload = `<forwarded><original_date>${originaldate}</original_date><original_text>${msg.text}</original_text></forwarded>`;
                return signalLegacyWorkflowExternalContext(workflowId, msg.forward_sender_name, payload);
            }

            if (msg.forward_from_chat) {
                const payload = `<forwarded><original_date>${originaldate}</original_date><original_text>${msg.text}</original_text></forwarded>`;
                return signalLegacyWorkflowExternalContext(workflowId, msg.forward_from_chat.title || "Unknown Chat", payload);
            }
        }

        return signalLegacyWorkflowMessage(workflowId, author, msg.text);
    }

    public static async handleTextCommandMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.text) {
            return;
        }

        Logger.debug(undefined, `Handling text command message: ${msg.text}`);
    }

    public static async handleLegacyNoOpMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from) {
            return;
        }

        Logger.debug(undefined, "Ignoring unsupported message type in legacy mode.");
    }

    private static workflowLegacySignalArguments(msg: TelegramBot.Message): { author: string; workflowId: string; } {
        const workflowId = createWorkflowId("telegram", String(msg.chat.id));
        return {
            author: msg.from!.last_name ? `${msg.from!.first_name} ${msg.from!.last_name}` : `${msg.from!.first_name}`,
            workflowId,
        };
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

}