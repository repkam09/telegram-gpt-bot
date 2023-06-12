import TelegramBot from "node-telegram-bot-api";
import { ChatMemory } from "../../singletons/memory";
import { isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../../utils";
import { processChatCompletion, processImageGeneration, processUserTextInput, updateChatContext } from "./common";
import { ChatCompletionRequestMessage } from "openai";
import { Logger } from "../../singletons/logger";
import { BotInstance } from "../../singletons/telegram";
import { Classifier } from "../../singletons/classifier";

export async function handlePrivateMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.text) {
        return;
    }

    Logger.trace("text_private", msg);

    const { first_name, last_name, username, id } = msg.from;
    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(id, `${first_name} ${last_name} [${username}] [${id}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, `Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ${id}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    // Determine what type of response we should send to the user...
    const type = Classifier.determineUserIntent(chatId, msg.text);

    if (type) {
        return await sendMessageWrapper(chatId, type);
    }

    if (type === "TEXT") {
        const prompt = buildPrompt(first_name);
        const message = await processUserTextInput(chatId, msg.text);
        const context = await updateChatContext(chatId, "user", message);
    
        const response = await processChatCompletion(chatId, [
            ...prompt,
            ...context
        ]);
    
        await updateChatContext(chatId, "assistant", response);
        await sendMessageWrapper(chatId, response);        
    }

    if (type === "IMAGE") {
        if (msg.text.length > 1000) {
            return await sendMessageWrapper(chatId, "Sorry, I ran into an error while trying to create your image. Try a shorter request.", { reply_to_message_id: msg.message_id });
        }

        const url = await processImageGeneration(chatId, msg.text);
        if (!url) {
            return await sendMessageWrapper(chatId, "Sorry, I ran into an error while trying to create your image. It might be restricted by [OpenAI content guidelines.](https://labs.openai.com/policies/content-policy)", { reply_to_message_id: msg.message_id, parse_mode: "MarkdownV2"}); 
        }

        BotInstance.instance().sendPhoto(chatId, url, {reply_to_message_id: msg.message_id});
    }
}

export function buildPrompt(name: string,): ChatCompletionRequestMessage[] {
    const date = new Date().toUTCString();
    const prompt: ChatCompletionRequestMessage[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `The current Date and Time is ${date}.`
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${name}' in a one-on-one private chat session.`
        }
    ];

    return prompt;
}