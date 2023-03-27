import { Configuration, OpenAIApi } from "openai";
import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'

dotenv.config()

const chatContextMap = new Map();

async function init() {
    const configuration = new Configuration({
        organization: process.env.OPENAI_API_ORG,
        apiKey: process.env.OPENAI_API_KEY,
    });

    const openai = new OpenAIApi(configuration);

    const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });

    const prefix = process.env.TELEGRAM_GROUP_PREFIX + " ";

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        let message = msg.text;
        let isGroupChat = false;

        if (!message) {
            return
        }

        if (msg.chat.type !== "private") {
            // If this is not a private chat, make sure that the user @'d the bot with a question directly
            if (!message.startsWith(prefix)) {
                return
            }

            // If the user did @ the bot, strip out that @ prefix before sending the message
            message = message.replace(prefix, "")
            isGroupChat = true;
        }

        // Only respond to special commands from within private chats
        if (msg.chat.type === "private") {
            // Add a command to reset the bots internal chat context memory
            if (message === "/reset") {
                resetMemory(chatId)
                bot.sendMessage(chatId, 'Memory has been reset');
                return
            }

            // Add some simple help text info
            if (message === "/start" || message === "/help" || message === "/about") {
                bot.sendMessage(chatId, 'Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-3.5 language model, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!', { parse_mode: 'Markdown' });
                return
            }

            if (message === "/debug") {
                if (process.env.TELEGRAM_BOT_ADMIN && process.env.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                    const keys = Array.from(chatContextMap.keys()).join(',')
                    bot.sendMessage(chatId, `Active Sessions: ${keys}`);
                    return
                }
            }
        }

        // If the incoming text is empty or a command, ignore it for the moment
        if (message.startsWith('/')) {
            bot.sendMessage(chatId, 'Unknown command.');
            return
        }

        // Pull out some identifiers for helpful logging
        const firstName = msg.chat.first_name || "User"
        const identifier = `${firstName} (${chatId})`

        // If a whitelist is provided check that the incoming chatId is in the list
        if (process.env.TELEGRAM_ID_WHITELIST) {
            const whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(',')
            if (!whitelist.includes(`${chatId}`)) {
                bot.sendMessage(chatId, 'Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ' + identifier);
                console.log(identifier, "sent a message but is not whitelisted")
                return
            }
        }

        // Create the message array to prompt the chat completion
        const messages = buildMessageArray(chatId, isGroupChat, firstName, message)

        // Ask OpenAI for the text completion and return the results to Telegram
        let response = null
        try {
            response = await openai.createChatCompletion({
                model: process.env.OPENAI_API_LLM,
                messages: messages,
            });
        } catch (err) {
            bot.sendMessage(chatId, 'Error: ' + err.message);

            // Clean up the chat context when something goes wrong, just in case...
            resetMemory(chatId)
            console.log("ChatId", chatId, "CreateChatCompletion Error:", err.message)
            return
        }

        if (response && response.data && response.data.choices) {
            // Extract the bot response 
            const result = response.data.choices[0].message

            try {
                // Send the response to the user
                bot.sendMessage(chatId, result.content, { parse_mode: "Markdown" });

                // Update our existing chat context with the result of this completion
                updateChatContext(chatId, result.role, result.content)
            } catch (err) {
                bot.sendMessage(chatId, 'Error: ' + err.message);

                // Clean up the chat context when something goes wrong, just in case...
                resetMemory(chatId)
                console.log("ChatId", chatId, "Telegram Response Error:", err.message)
                return
            }
        }
    });
}

function updateChatContext(chatId, role, content) {
    const currentChatContext = chatContextMap.get(chatId)

    if (currentChatContext.length > 10) {
        // Remove the oldest user message from memory
        currentChatContext.shift()
        // Remove the oldest assistant message from memory
        currentChatContext.shift()
    }

    currentChatContext.push({ role, content })
    chatContextMap.set(chatId, currentChatContext)

    try {
        console.log(chatId, role, content.split('\n')[0])
    } catch (err) {
        // ignore this
    }
}

function buildMessageArray(chatId, isGroupChat, firstName, nextUserMessage) {
    if (!chatContextMap.has(chatId)) {
        chatContextMap.set(chatId, [])
    }

    updateChatContext(chatId, "user", nextUserMessage)

    const prompt = []

    if (!isGroupChat) {
        prompt.push({ role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You are assisting a user named '${firstName}'. You should respond in paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable.` })
    }

    if (isGroupChat) {
        prompt.push({ role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable.` })
    }

    // Provide admin level users with extra information they can ask about
    if (process.env.TELEGRAM_BOT_ADMIN && process.env.TELEGRAM_BOT_ADMIN === `${chatId}`) {
        const keys = Array.from(chatContextMap.keys()).join(',')
        prompt.push({
            role: "system", content: `Here is some additional information about the environment and user sessions. Current User Id: ${chatId}, Active User Sessions: ${keys}, User Whitelist: ${process.env.TELEGRAM_ID_WHITELIST || 'empty'}`
        })
    }

    return [
        ...prompt,
        ...chatContextMap.get(chatId),
    ]
}

function resetMemory(chatId) {
    if (chatContextMap.has(chatId)) {
        chatContextMap.delete(chatId)
    }
}

// Check for configuration values at startup
if (!process.env.OPENAI_API_ORG) {
    throw new Error("Missing OPENAI_API_ORG")
}

if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY")
}

if (!process.env.TELEGRAM_BOT_KEY) {
    throw new Error("Missing TELEGRAM_BOT_KEY")
}

if (!process.env.TELEGRAM_GROUP_PREFIX) {
    throw new Error("Missing TELEGRAM_GROUP_PREFIX")
}

if (!process.env.OPENAI_API_LLM) {
    throw new Error("Missing OPENAI_API_LLM")
}

if (process.env.TELEGRAM_ID_WHITELIST) {
    console.log("Whitelist Enabled: " + process.env.TELEGRAM_ID_WHITELIST)
}

if (process.env.TELEGRAM_BOT_ADMIN) {
    console.log("Bot Admin: " + process.env.TELEGRAM_BOT_ADMIN)
}

// Start the bot and listeners
init()
