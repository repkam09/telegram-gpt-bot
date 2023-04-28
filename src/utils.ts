import { Config } from "./singletons/config";
import { BotInstance } from "./singletons/telegram";
import {ChatMemory} from "./singletons/memory";
import { Logger } from "./singletons/logger";
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from "openai";

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

export async function sendAdminMessage(content: string) {
    Logger.info("Notice: " + content);

    if (Config.TELEGRAM_BOT_ADMIN !== -1 && !Config.HENNOS_DEVELOPMENT_MODE) {
        await BotInstance.instance().sendMessage(Config.TELEGRAM_BOT_ADMIN, content, {});
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

export async function updateChatContext(chatId: number, role: ChatCompletionRequestMessageRoleEnum, content: string, name: string) {
    if (!await ChatMemory.hasContext(chatId)) {
        await ChatMemory.setContext(chatId, []);
    }

    const currentChatContext = await ChatMemory.getContext(chatId);
    
    if (currentChatContext.length > Config.HENNOS_MAX_MESSAGE_MEMORY) {
        // Remove the oldest user message from memory
        currentChatContext.shift();
        // Remove the oldest assistant message from memory
        currentChatContext.shift();
    }

    currentChatContext.push({ role, content });
    await ChatMemory.setContext(chatId, currentChatContext);

    try {
        Logger.info(name, chatId, role, content.split("\n")[0]);
    } catch (err) {
        // ignore this
    }
}

export async function buildMessageArray(chatId: number, isGroupChat: boolean, firstName: string, nextUserMessage: string, groupName: string) {
    await updateChatContext(chatId, "user", nextUserMessage, firstName);

    const prompt: ChatCompletionRequestMessage[] = [{ role: "system", content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable." }];

    prompt.push({ role: "system", content: `The current Date and Time is ${new Date().toUTCString()}.` });

    if (!isGroupChat) {
        prompt.push({ role: "system", content: `You are currently assisting a user named '${firstName}' in a one-on-one private chat session.` });
    }

    if (isGroupChat) {
        prompt.push({ role: "system", content: `You are currently assisting users within a group chat setting. The group chat is called '${groupName}'.` });
    }

    // Provide admin level users with extra information they can ask about
    if (Config.TELEGRAM_BOT_ADMIN === chatId) {
        const keys = Array.from(await ChatMemory.getContextKeys()).join(",");
        prompt.push({
            role: "system", content: `Here is some additional information about the environment and user sessions. Current User Id: ${chatId}, Active User Sessions: ${keys}, User Whitelist: ${Config.TELEGRAM_ID_WHITELIST || "empty"}`
        });
    }

    const result: ChatCompletionRequestMessage[] = [
        ...prompt,
        ...await ChatMemory.getContext(chatId),
    ];

    return result;
}

export async function resetMemory(chatId: number): Promise<void> {
    await ChatMemory.deleteContext(chatId);
}

