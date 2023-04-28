import { Config } from "./singletons/config";
import { BotInstance } from "./singletons/telegram";
import {ChatMemory} from "./singletons/memory";
import { Logger } from "./singletons/logger";

export async function sendMessageWrapper(chatId: number, content: string, options = {}) {
    if (!content) {
        throw new Error("Message content is undefined");
    }

    if (!content.length) {
        throw new Error("Message content does not have a length property");
    }

    if (content.length < 4096) {
        return await BotInstance.instance().sendMessage(chatId, content, options);
    }

    const chunks = chunkSubstr(content, 4096);
    for (let i = 0; i < chunks.length; i++) {
        await BotInstance.instance().sendMessage(chatId, chunks[i], options);
    }
}

function chunkSubstr(str: string, size: number) {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);

    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size);
    }

    return chunks;
}

export function updateChatContext(chatId: number, role: string, content: string, name: string) {
    if (!ChatMemory.Context.has(chatId)) {
        ChatMemory.Context.set(chatId, []);
    }

    const currentChatContext = ChatMemory.Context.get(chatId);

    if (currentChatContext.length > ChatMemory.MAX_MESSAGE_MEMORY) {
        // Remove the oldest user message from memory
        currentChatContext.shift();
        // Remove the oldest assistant message from memory
        currentChatContext.shift();
    }

    currentChatContext.push({ role, content });
    ChatMemory.Context.set(chatId, currentChatContext);

    try {
        Logger.info(name, chatId, role, content.split("\n")[0]);
    } catch (err) {
        // ignore this
    }
}

export function buildMessageArray(chatId: number, isGroupChat: boolean, firstName: string, nextUserMessage: string, groupName: string) {
    updateChatContext(chatId, "user", nextUserMessage, firstName);

    const prompt = [{ role: "system", content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable." }];

    prompt.push({ role: "system", content: `The current Date and Time is ${new Date().toUTCString()}.` });

    if (!isGroupChat) {
        prompt.push({ role: "system", content: `You are currently assisting a user named '${firstName}' in a one-on-one private chat session.` });
    }

    if (isGroupChat) {
        prompt.push({ role: "system", content: `You are currently assisting users within a group chat setting. The group chat is called '${groupName}'.` });
    }

    // Provide admin level users with extra information they can ask about
    if (Config.TELEGRAM_BOT_ADMIN && Config.TELEGRAM_BOT_ADMIN === `${chatId}`) {
        const keys = Array.from(ChatMemory.Context.keys()).join(",");
        prompt.push({
            role: "system", content: `Here is some additional information about the environment and user sessions. Current User Id: ${chatId}, Active User Sessions: ${keys}, User Whitelist: ${Config.TELEGRAM_ID_WHITELIST || "empty"}`
        });
    }

    const result = [
        ...prompt,
        ...ChatMemory.Context.get(chatId),
    ];

    return result;
}

export function resetMemory(chatId: number) {
    if (ChatMemory.Context.has(chatId)) {
        ChatMemory.Context.delete(chatId);
    }
}

