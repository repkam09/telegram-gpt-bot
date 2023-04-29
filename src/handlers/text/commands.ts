import TelegramBot from "node-telegram-bot-api";
import { Config } from "../../singletons/config";
import { resetMemory, sendMessageWrapper } from "../../utils";
import { OpenAI } from "../../singletons/openai";
import { ChatMemory } from "../../singletons/memory";

type MessageWithText = TelegramBot.Message & { text: string }

export function handleCommandMessage(msg: TelegramBot.Message) {
    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.text === "/reset") {
        return handleResetCommand(msg as MessageWithText);
    }

    if (msg.text === "/start" || msg.text === "/help" || msg.text === "/about") {
        return handleStartCommand(msg as MessageWithText);
    }

    if (msg.text.startsWith("/configure")) {
        return handleConfigureLLMCommand(msg as MessageWithText);
    }

    return sendMessageWrapper(msg.chat.id, "Unknown Command");
}

function isAdmin(chatId: number): boolean {
    return Config.TELEGRAM_BOT_ADMIN === chatId;
}

async function handleConfigureLLMCommand(msg: MessageWithText) {
    if (!isAdmin(msg.chat.id)) {
        return;
    }

    const parts = msg.text.split(" ");
    if (parts.length !== 3) {
        return await sendMessageWrapper(msg.chat.id, "Syntax Error");
    }

    try {
        const chatIdParam = parseInt(parts[1]);
        const models = await OpenAI.models();

        if (!models.includes(parts[2])) {
            return await sendMessageWrapper(msg.chat.id, `Unknown LLM ${parts[2]}, valid options are: ${models.join(", ")}`);
        }

        await ChatMemory.setLLM(chatIdParam, parts[2]);
        return await sendMessageWrapper(msg.chat.id, `Chat ${parts[1]} will now use LLM ${parts[2]}`);
    } catch (err: unknown) {
        const error = err as Error;
        return await sendMessageWrapper(msg.chat.id, `Error: ${error.message} \n ${error}`);
    }
}

async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, "Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-3.5 language model, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!", { parse_mode: "Markdown" });
}

async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Memory has been reset");
}