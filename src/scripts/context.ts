import dotenv from "dotenv";
import readline from "node:readline/promises";


import { Config } from "../singletons/config";
import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";
import { handlePrivateMessage } from "../handlers/text/private";
import { Logger } from "../singletons/logger";

dotenv.config();

async function context() {
    await Database.init();

    const user = new HennosUser(Config.TELEGRAM_BOT_ADMIN);
    await user.setBasicInfo("Test");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const userInfo = await user.getBasicInfo();
    Logger.log(JSON.stringify(userInfo, null, 4));

    let input;

    while (input !== "exit") {
        Logger.log("\n\n");
        input = await rl.question(" > ");
        if (input !== "exit") {
            Logger.log("\n\n");
            const result = await handlePrivateMessage(user, input);
            Logger.log("\n\n");
            Logger.log(" < " + result);
        }
    }

    rl.close();
}

context();
