import { BotInstance } from "../singletons/telegram";
import { Logger } from "../singletons/logger";
import { sendMessageWrapper, updateChatContext } from "../utils";

export function listen() {
    Logger.info("Ataching Location Message Listener");
    BotInstance.instance().on("location", async (msg) => {
        const chatId = msg.chat.id;
        if (msg.chat.type !== "private" || !msg.from || !msg.location) {
            return;
        }

        updateChatContext(chatId, "user", `Here is my location as of '${new Date().toUTCString()}': lat=${msg.location.latitude}, lon=${msg.location.longitude}`, msg.from.first_name);
        await sendMessageWrapper(chatId, `Success! Your provided location will be taken into account, if relevant, in future messages.\n\n Information: ${JSON.stringify(msg.location)}.`);
    });
}