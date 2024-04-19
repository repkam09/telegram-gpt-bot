import dotenv from "dotenv";

import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";

dotenv.config();

async function context(chatId: number) {
    await Database.init();

    const user = await HennosUser.exists(chatId);
    if (!user) {
        console.log("User does not exist");
        return;
    }

    const userInfo = await user.getBasicInfo();
    console.log(JSON.stringify(userInfo, null, 4));

    const context = await user.getChatContext();
    context.forEach((msg) => {
        console.log(`Role: ${msg.role}`);
        console.log(msg.content);
        console.log("============================");
    });
}

if (process.argv.length >= 2) {
    const parse = parseInt(process.argv[2]);
    context(parse);
} else {
    console.warn("Expected an argument for chatId");
}
