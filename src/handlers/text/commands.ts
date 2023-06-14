import TelegramBot from "node-telegram-bot-api";
import { resetMemory, sendMessageWrapper } from "../../utils";
import { Logger } from "../../singletons/logger";

type MessageWithText = TelegramBot.Message & { text: string }

export function handleCommandMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
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

async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, "Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-3.5 language model, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!");
}

async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Memory has been reset");
}