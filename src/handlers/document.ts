import { BotInstance } from "../singletons/telegram";
import { Logger } from "../singletons/logger";
import { sendMessageWrapper } from "../utils";

export function listen() {
    Logger.info("Ataching Document Message Listener");
    BotInstance.instance().on("document", async (msg) => {
        const chatId = msg.chat.id;
        if (msg.chat.type !== "private" || !msg.from || !msg.document) {
            return;
        }

        await sendMessageWrapper(chatId, `Error: Documents and Files are not yet supported.\n\n Information: ${JSON.stringify(msg.document)}`);
    });
}