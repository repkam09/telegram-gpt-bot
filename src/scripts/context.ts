import dotenv from "dotenv";
import readline from "node:readline/promises";


import { Config } from "../singletons/config";
import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";
import { handlePrivateMessage } from "../handlers/text/private";

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
    console.log(JSON.stringify(userInfo, null, 4));

    const token = await user.createPairingToken();
    console.log(`Pairing token: ${token}`);

    let input;

    while (input !== "exit") {
        console.log("\n\n");
        input = await rl.question(" > ");
        if (input !== "exit") {
            console.log("\n\n");
            const result = await handlePrivateMessage(user, input);
            console.log("\n\n");
            console.log(" < " + result);
        }
    }

    rl.close();
}

context();
