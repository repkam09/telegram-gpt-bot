import { getChatContext } from "../handlers/text/common";
import { Config } from "../singletons/config";
import { ChatMemory } from "../singletons/memory";
import { Database } from "../singletons/sqlite";
import dotenv from "dotenv";

dotenv.config();

async function context() {
    Config.validate();
    await Database.init();

    const chatContext = await getChatContext(Config.TELEGRAM_BOT_ADMIN);
    console.log(JSON.stringify(chatContext, null, 4));

    const userInfo = await ChatMemory.getUserInfo(Config.TELEGRAM_BOT_ADMIN);
    console.log(JSON.stringify(userInfo, null, 4));
}

context();
