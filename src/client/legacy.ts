import path from "node:path";
import mimetype from "mime-types";
import TelegramBot from "node-telegram-bot-api";
import { createWorkflowId, signalLegacyWorkflowExternalContext, signalLegacyWorkflowImageMessage, signalLegacyWorkflowMessage } from "../temporal/legacy/interface";
import { TelegramInstance } from "./telegram";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";



export class TelegramLegacyInstance {
    public static async handleDocumentMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.document) {
            return;
        }

        throw new Error("Not Implemented");
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

        throw new Error("Not Implemented");
    }

    public static async handleVoiceMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.voice) {
            return;
        }

        throw new Error("Not Implemented");
    }

    public static async handleContactMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.contact) {
            return;
        }

        throw new Error("Not Implemented");
    }


    public static async handleLocationMessage(msg: TelegramBot.Message): Promise<void> {
        if (!msg.from || !msg.location) {
            return;
        }

        throw new Error("Not Implemented");
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

        throw new Error("Not Implemented");
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