import { BotInstance } from "./singletons/telegram";
import { Logger } from "../singletons/logger";
import { Config } from "./singletons/config";
import { ChatMemory } from "./singletons/memory";
import { OpenAI } from "./singletons/openai";
import { sendMessageWrapper, updateChatContext, resetMemory, buildMessageArray } from "./utils";

export function listen() {
    Logger.info("Ataching Audio Message Listener");
    BotInstance.instance().on("text", async (msg) => {
        const chatId = msg.chat.id;

        let message = msg.text;
        let isGroupChat = false;

        if (!message) {
            return;
        }

        if (msg.chat.type !== "private") {
        // If this is not a private chat, make sure that the user @'d the bot with a question directly
            if (!message.startsWith(Config.TELEGRAM_GROUP_PREFIX)) {
                return;
            }

            // If the user did @ the bot, strip out that @ prefix before sending the message
            message = message.replace(Config.TELEGRAM_GROUP_PREFIX, "");
            isGroupChat = true;
        }

        // Only respond to special commands from within private chats
        if (msg.chat.type === "private") {
        // Add a command to reset the bots internal chat context memory
            if (message === "/reset") {
                resetMemory(chatId);
                await sendMessageWrapper(chatId, "Memory has been reset");
                return;
            }

            // Add some simple help text info
            if (message === "/start" || message === "/help" || message === "/about") {
                await sendMessageWrapper(chatId, "Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-3.5 language model, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!", { parse_mode: "Markdown" });
                return;
            }

            if (message === "/debug") {
                if (Config.TELEGRAM_BOT_ADMIN && Config.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                    const userKeys = Array.from(ChatMemory.IdToName.keys()).map((key) => ChatMemory.IdToName.get(key));
                    if (userKeys.length > 0) {
                        await sendMessageWrapper(chatId, userKeys.join("\n"));
                    } else {
                        await sendMessageWrapper(chatId, "There are no active user sessions");
                    }

                    const chatkeys = Array.from(ChatMemory.Context.keys()).filter((chatId) => !ChatMemory.IdToName.has(chatId));
                    if (chatkeys.length > 0) {
                        await sendMessageWrapper(chatId, `There are also several IDs that do not correspond to user chats. These are usually Group Chats: \n${chatkeys.join(", ")}`);
                    }
                    return;
                }
            }

            if (message.startsWith("/configure")) {
                if (Config.TELEGRAM_BOT_ADMIN && Config.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                    const parts = message.split(" ");
                    if (parts.length !== 3) {
                        return await sendMessageWrapper(chatId, "Syntax Error");
                    }

                    try {
                        const chatIdParam = parseInt(parts[1]);
                        const models = await OpenAI.models();

                        if (!models.includes(parts[2])) {
                            return await sendMessageWrapper(chatId, `Unknown LLM ${parts[2]}, valid options are: ${models.join(", ")}`);
                        }

                        ChatMemory.IdToLLM.set(chatIdParam, parts[2]);
                        return await sendMessageWrapper(chatId, `Chat ${parts[1]} will now use LLM ${parts[2]}`);
                    } catch (err) {
                        return await sendMessageWrapper(chatId, `Error: ${err.message} \n ${err}`);
                    }
                }
            }
        }

        // If the incoming text is empty or a command, ignore it for the moment
        if (message.startsWith("/")) {
            await sendMessageWrapper(chatId, "Unknown command.");
            return;
        }

        // Pull out some identifiers for helpful logging
        const firstName = msg.from.first_name || "undefined";
        const lastName = msg.from.last_name || "undefined";
        const username = msg.from.username || "undefined";
        const userId = msg.from.id || "undefined";
        const groupName = msg.chat.title || "undefined";

        const identifier = `${firstName} ${lastName} [${username}] [${userId}]`;

        if (!ChatMemory.IdToName.has(userId)) {
            ChatMemory.IdToName.set(userId, identifier);
        }

        // If a whitelist is provided check that the incoming chatId is in the list
        if (Config.TELEGRAM_ID_WHITELIST) {
            const whitelist = Config.TELEGRAM_ID_WHITELIST.trim().split(",");
            if (!whitelist.includes(`${chatId}`)) {
                await sendMessageWrapper(chatId, "Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: " + identifier);
                Logger.info(`${identifier} {${chatId}}`, "sent a message but is not whitelisted");
                return;
            }
        }

        // Create the message array to prompt the chat completion
        const messages = buildMessageArray(chatId, isGroupChat, firstName, message, groupName);

        // Ask OpenAI for the text completion and return the results to Telegram
        let response = null;
        let model = Config.OPENAI_API_LLM;
        try {
            if (ChatMemory.IdToLLM.has(chatId)) {
                model = ChatMemory.IdToLLM.get(chatId);
            }

            response = await OpenAI.instance().createChatCompletion({
                model: model,
                messages: messages,
            });
        } catch (err) {
            await sendMessageWrapper(chatId, "Error: " + err.message);

            // Clean up the chat context when something goes wrong, just in case...
            resetMemory(chatId);
            Logger.info("ChatId", chatId, "CreateChatCompletion Error:", err.message, "\n", err);
            return;
        }

        if (response && response.data && response.data.choices) {
        // Extract the bot response 
            const result = response.data.choices[0].message || { content: "Error", role: "assistant" };

            try {
            // Send the response to the user, making sure to split the message if needed
                await sendMessageWrapper(chatId, result.content, { parse_mode: "Markdown" });
            } catch (err1) {
                Logger.info("ChatId", chatId, "Telegram Response Error:", err1.message, "Failed x1");

                try {
                // Send the response to the user, making sure to split the message if needed
                // If this failed once, remove the Markdown parser and try again
                    await sendMessageWrapper(chatId, result.content, {});
                } catch (err2) {
                    await sendMessageWrapper(chatId, "Error: " + err2.message);

                    // Clean up the chat context when something goes wrong, just in case...
                    resetMemory(chatId);
                    Logger.info("ChatId", chatId, "Telegram Response Error:", err2.message, "Failed x2");
                    return;
                }
            }
            // Update our existing chat context with the result of this completion
            updateChatContext(chatId, result.role, result.content, result.role);
        }
    });
}