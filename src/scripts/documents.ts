import path from "path";
import { Config } from "../singletons/config";
import { handlePlainTextDocument } from "../handlers/document";
import TelegramBot from "node-telegram-bot-api";

async function test() {
    Config.validate();

    const chatId = 89941288;
    const filePath = path.join("documents", "89941288");

    const document: TelegramBot.Document = {
        file_name: "file_name",
        file_size: 0,
        mime_type: "text/plain",
        file_id: "file_id",
        file_unique_id: "file_unique_id",
        thumb: undefined
    };

    const startTime = Date.now();
    try {
        const result = await handlePlainTextDocument(chatId, filePath, document);
        const endTime = Date.now();
        console.log(result, `Execution time: ${endTime - startTime}ms`);
    } catch (err) {
        const endTime = Date.now();
        console.error(err, `Execution time: ${endTime - startTime}ms`);
    }
}

// Kick off the async function
test();