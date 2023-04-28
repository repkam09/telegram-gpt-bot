import { BotInstance } from "../singletons/telegram";
import { Logger } from "../singletons/logger";
import { sendMessageWrapper, updateChatContext } from "../utils";

export function listen() {
    Logger.info("Ataching Contact Message Listener");
    BotInstance.instance().on("contact", async (msg) => {
        const chatId = msg.chat.id;
        if (msg.chat.type !== "private" || !msg.from || !msg.contact) {
            return;
        }

        updateChatContext(chatId, "user", `Here is the contact information for '${msg.contact.first_name}'. Phone Number: ${msg.contact.phone_number}`, msg.from.first_name);
        await sendMessageWrapper(chatId, `I have received the information for your provided contact '${msg.contact.first_name}'`);
    });
}