import { BotInstance } from "../../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";
import { handleGroupMessage } from "./group";
import { handlePrivateMessage } from "./private";
import { handleCommandMessage } from "./commands";
import { Logger } from "../../singletons/logger";


export function listen() {
    BotInstance.instance().on("text", handleText);
}

async function handleText(msg: TelegramBot.Message) {
    Logger.trace("text", msg);

    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.chat.type !== "private") {
        return handleGroupMessage(msg);
    }

    if (msg.chat.type === "private") {
        if (msg.text.startsWith("/")) {
            return handleCommandMessage(msg);
        }
        return handlePrivateMessage(msg);
    }
}
