import TelegramBot from "node-telegram-bot-api";
import { resetMemory, sendMessageWrapper } from "../../utils";
import { Logger } from "../../singletons/logger";

type MessageWithText = TelegramBot.Message & { text: string }

export function handleCommandMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.chat.type !== "private") {
        return;
    }

    Logger.trace("text_command", msg);

    if (msg.text === "/reset") {
        return handleResetCommand(msg as MessageWithText);
    }

    if (msg.text === "/start" || msg.text === "/help" || msg.text === "/about") {
        return handleStartCommand(msg as MessageWithText);
    }

    return sendMessageWrapper(msg.chat.id, "Unknown Command");
}

const aboutText = `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

This bot is whitelisted for use by approved users only.
Contact @repkam09 to request access!

For more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`;

async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, aboutText);
}

async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Previous chat context has been cleared.");
}
