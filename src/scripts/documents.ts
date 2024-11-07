import path from "path";
import { Config } from "../singletons/config";
import { handleDocument } from "../handlers/document";
import { MarkdownReader } from "llamaindex";
import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";

async function test() {
    await Database.init();
    const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
    if (!user) {
        throw new Error("Existing admin user account not found");
    }

    await user.setPreferredProvider("openai");

    const filePath = path.join(__dirname, "../../README.md",);

    const startTime = Date.now();
    try {
        const result = await handleDocument(user, filePath, "file_unique_id", new MarkdownReader());
        const endTime = Date.now();
        console.log(result, `\nExecution time: ${endTime - startTime}ms`);
    } catch (err) {
        const endTime = Date.now();
        console.error(err, `\nExecution time: ${endTime - startTime}ms`);
    }
}

// Kick off the async function
test();