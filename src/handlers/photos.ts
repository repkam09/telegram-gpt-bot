import { BotInstance } from "../singletons/telegram";
import { Logger } from "../singletons/logger";
import { sendMessageWrapper } from "../utils";

export function listen() {
    Logger.info("Ataching Photo Message Listener");
    BotInstance.instance().on("photo", async (msg) => {
        const chatId = msg.chat.id;
        if (msg.chat.type !== "private" || !msg.from || !msg.photo) {
            return;
        }

        await sendMessageWrapper(chatId, `Error: Images are not yet supported.\n\n Information: ${JSON.stringify(msg.photo)}`);
    });
}