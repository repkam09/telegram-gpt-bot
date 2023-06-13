import TelegramBot from "node-telegram-bot-api";
import { Config } from "../../singletons/config";
import { ChatMemory } from "../../singletons/memory";
import { isOnWhitelist, sendMessageWrapper, sendAdminMessage } from "../../utils";
import { ChatCompletionRequestMessage } from "openai";
import { updateChatContext, processChatCompletion, processUserTextInput, processImageGeneration } from "./common";
import { Logger } from "../../singletons/logger";
import { BotInstance } from "../../singletons/telegram";
import { Classifier } from "../../singletons/classifier";

export async function handleGroupMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (!msg.from || !msg.text) {
        return;
    }

    if (!msg.text.startsWith(Config.TELEGRAM_GROUP_PREFIX)) {
        return;
    }

    Logger.trace("text_group", msg);

    // If the user did @ the bot, strip out that @ prefix before sending the message
    msg.text = msg.text.replace(Config.TELEGRAM_GROUP_PREFIX, "");


    const { first_name, last_name, username, id } = msg.from;
    const { title } = msg.chat;

    if (!await ChatMemory.hasName(id)) {
        await ChatMemory.setName(chatId, `${title} [${chatId}]`);
    }

    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(chatId, `Sorry, this group chat has not been whitelisted to use this bot. Please request access and provide the group identifier: ${chatId}`);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message from group chat '${title} [${chatId}]' but the group is not whitelisted`);
        return;
    }

    // Determine what type of response we should send to the user...
    const type = Classifier.determineUserIntent(chatId, msg.text);

    if (type === "TEXT") {
        const prompt = buildPrompt(title || "Group Chat");
        const message = await processUserTextInput(chatId, msg.text);
        const context = await updateChatContext(chatId, "user", message);

        const response = await processChatCompletion(chatId, [
            ...prompt,
            ...context
        ], { functions: false });

        if (response.type === "content") {
            await updateChatContext(chatId, "assistant", response.data);
            await sendMessageWrapper(chatId, response.data, { reply_to_message_id: msg.message_id });
            return;
        }
    }

    if (type === "IMAGE") {
        if (msg.text.length > 1000) {
            return await sendMessageWrapper(chatId, "Sorry, I ran into an error while trying to create your image. Try a shorter request.", { reply_to_message_id: msg.message_id });
        }

        const url = await processImageGeneration(chatId, msg.text);
        if (!url) {
            return await sendMessageWrapper(chatId, "Sorry, I ran into an error while trying to create your image. It might be restricted by [OpenAI content guidelines.](https://labs.openai.com/policies/content-policy)", { reply_to_message_id: msg.message_id, parse_mode: "MarkdownV2" }); 
        }

        BotInstance.instance().sendPhoto(chatId, url, {reply_to_message_id: msg.message_id});
    }
}

function buildPrompt(title: string,): ChatCompletionRequestMessage[] {
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
            content: `You are currently assisting users within a group chat setting. The group chat is called '${title}'.`
        }
    ];

    return prompt;
}