import { BotInstance } from "../../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";
import { handleGroupMessage } from "./group";
import { handlePrivateMessage } from "./private";
import { handleCommandMessage } from "./commands";

export function listen() {
    BotInstance.instance().on("text", handleText);
}

const chatmap = new Map<string, TelegramBot.Message[]>();

async function handleText(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    const uuid = `${msg.chat.id}_${msg.from.id}`;
    if (!chatmap.has(uuid)) {
        chatmap.set(uuid, []);
    }
    // chatmap.set(uuid,);

    if (msg.text.startsWith("/")) {
        return handleCommandMessage(msg);
    }

    if (msg.chat.type !== "private") {
        return handleGroupMessage(msg);
    }

    if (msg.chat.type === "private") {
        return handlePrivateMessage(msg);
    }
}
