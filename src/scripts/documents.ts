import path from "path";
import { Config } from "../singletons/config";
import { handlePlainTextDocument } from "../handlers/document";
import { HennosUser } from "../singletons/user";
import { Logger } from "../singletons/logger";

async function test() {
    const user = new HennosUser(Config.TELEGRAM_BOT_ADMIN);
    const filePath = path.join("documents", Config.TELEGRAM_BOT_ADMIN.toString());

    const startTime = Date.now();
    try {
        const result = await handlePlainTextDocument(user, filePath, "file_unique_id");
        const endTime = Date.now();
        Logger.log(result, `Execution time: ${endTime - startTime}ms`);
    } catch (err) {
        const endTime = Date.now();
        Logger.log(err, `Execution time: ${endTime - startTime}ms, with error`);
    }
}

// Kick off the async function
test();