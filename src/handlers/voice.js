import { BotInstance } from "./singletons/telegram";
import { Logger } from "../singletons/logger";
import { sendMessageWrapper } from "../utils";

export function listen() {
    Logger.info("Ataching Audio Message Listener");
    BotInstance.instance().on("voice", async (msg) => {
        const chatId = msg.chat.id;
        if (msg.chat.type !== "private") {
            return;
        }

        await sendMessageWrapper(chatId, `Error: Voice recordings are not yet supported.\n\n Information: ${JSON.stringify(msg.voice)}`);
    });
}