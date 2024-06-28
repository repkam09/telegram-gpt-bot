import path from "path";
import { Config } from "../singletons/config";
import { handleDocument } from "../handlers/document";
import { HennosUserAsync } from "../singletons/user";
import { SimpleDirectoryReader } from "llamaindex";

async function test() {
    const user = await HennosUserAsync(Config.TELEGRAM_BOT_ADMIN, "Test");
    const filePath = path.join("documents", Config.TELEGRAM_BOT_ADMIN.toString());

    const startTime = Date.now();
    try {
        const result = await handleDocument(user, filePath, "file_unique_id", new SimpleDirectoryReader()
        );
        const endTime = Date.now();
        console.log(result, `Execution time: ${endTime - startTime}ms`);
    } catch (err) {
        const endTime = Date.now();
        console.error(err, `Execution time: ${endTime - startTime}ms`);
    }
}

// Kick off the async function
test();