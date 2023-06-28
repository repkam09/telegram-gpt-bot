import { BotInstance } from "../../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";
import { handleGroupMessage } from "./group";
import { handlePrivateMessage } from "./private";
import { handleCommandMessage } from "./commands";

export function listen() {
    BotInstance.instance().on("text", handleText);
}

async function handleText(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

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
