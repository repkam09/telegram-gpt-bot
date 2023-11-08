import { BotInstance } from "../../singletons/telegram";
import TelegramBot from "node-telegram-bot-api";
import { handleGroupMessage } from "./group";
import { handlePrivateMessage } from "./private";
import { handleCommandMessage, handleCommandMessageCallback } from "./commands";

type InputCallbackFunction = (msg: TelegramBot.Message) => Promise<void> | void

export function listen() {
    BotInstance.instance().on("text", handleText);
    BotInstance.instance().on("callback_query", handleCommandMessageCallback);
}

const chatmap = new Map<number, TelegramBot.Message[]>();
const timermap = new Map<number, NodeJS.Timeout>();
const callbacks = new Map<number, InputCallbackFunction>();

export function registerInputCallback(chatId: number, callback: InputCallbackFunction) {
    callbacks.set(chatId, callback);
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
        if (callbacks.has(msg.chat.id)) {
            const callback = callbacks.get(msg.chat.id) as InputCallbackFunction;
            callbacks.delete(msg.chat.id);
            return callback(msg);
        }

        // Do a little bit of cleaning in case the user sends a message that is longer than the 
        // allowed length in Telegram, it gets split into multiple. Or they send message in quick succession. 
        clearTimeout(timermap.get(msg.chat.id));
        chatmap.set(msg.chat.id, [...(chatmap.get(msg.chat.id) || []), msg]);

        const timeout = setTimeout(() => processUserMessages(msg.chat.id), 2000);
        timermap.set(msg.chat.id, timeout);
    }
}

function processUserMessages(chatId: number) {
    timermap.delete(chatId);

    const messages = chatmap.get(chatId);
    chatmap.delete(chatId);

    if (!messages) return;

    if (messages.length === 1) {
        return handlePrivateMessage(messages[0]);
    }

    const combinedText = messages.map((message) => message.text).join("\n");
    const lastMessage = { ...messages[messages.length - 1], text: combinedText };

    return handlePrivateMessage(lastMessage);
}
