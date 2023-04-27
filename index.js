// @ts-check

import { Configuration, OpenAIApi } from "openai";
import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'

dotenv.config()

const chatContextMap = new Map();
const userIdToNameMap = new Map();
const chatIdToLLMMap = new Map();

class Config {
    static validate() {
        if (!Config.OPENAI_API_ORG) {
            throw new Error("Missing OPENAI_API_ORG")
        }

        if (!Config.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY")
        }

        if (!Config.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY")
        }

        if (!Config.TELEGRAM_GROUP_PREFIX) {
            throw new Error("Missing TELEGRAM_GROUP_PREFIX")
        }

        if (!Config.OPENAI_API_LLM) {
            throw new Error("Missing OPENAI_API_LLM")
        }

        if (Config.TELEGRAM_ID_WHITELIST) {
            console.log("Whitelist Enabled: " + Config.TELEGRAM_ID_WHITELIST)
        }

        if (Config.TELEGRAM_BOT_ADMIN) {
            console.log("Bot Admin: " + Config.TELEGRAM_BOT_ADMIN)
        }
    }

    static get OPENAI_API_ORG() {
        return process.env.OPENAI_API_ORG || 'unknown'
    }

    static get OPENAI_API_KEY() {
        return process.env.OPENAI_API_KEY || 'unknown'
    }

    static get TELEGRAM_BOT_KEY() {
        return process.env.TELEGRAM_BOT_KEY || 'unknown'
    }

    static get TELEGRAM_GROUP_PREFIX() {
        return process.env.TELEGRAM_GROUP_PREFIX || 'unknown'
    }

    static get TELEGRAM_BOT_ADMIN() {
        return process.env.TELEGRAM_BOT_ADMIN || 'unknown'
    }

    static get TELEGRAM_ID_WHITELIST() {
        return process.env.TELEGRAM_ID_WHITELIST || 'unknown'
    }

    static get OPENAI_API_LLM() {
        return process.env.OPENAI_API_LLM || 'unknown'
    }
}

class OpenAI {
    static _instance
    static _models

    /**
     * 
     * @returns {OpenAIApi} OpenAI API Instance
     */
    static instance() {
        if (!OpenAI._instance) {
            const configuration = new Configuration({
                organization: Config.OPENAI_API_ORG,
                apiKey: Config.OPENAI_API_KEY,
            });

            OpenAI._instance = new OpenAIApi(configuration)
        }

        return OpenAI._instance
    }

    /**
     * 
     * @returns {Promise<string[]>} OpenAI Model names
     */
    static async models() {
        if (!OpenAI._models) {
            const models = await OpenAI.instance().listModels()
            OpenAI._models = models.data.data.map((model) => model.id)
        }

        return OpenAI._models
    }
}

class BotInstance {
    static _instance

    static instance() {
        if (!BotInstance._instance) {
            BotInstance._instance = new TelegramBot(Config.TELEGRAM_BOT_KEY, { polling: true });
        }

        return BotInstance._instance
    }
}

async function sendMessageWrapper(chatId, content, options = {}) {
    if (!content) {
        throw new Error('Message content is undefined')
    }

    if (!content.length) {
        throw new Error('Message content does not have a length property')
    }

    if (content.length < 4096) {
        return await BotInstance.instance().sendMessage(chatId, content, options)
    }

    const chunks = chunkSubstr(content, 4096)
    for (let i = 0; i < chunks.length; i++) {
        await BotInstance.instance().sendMessage(chatId, chunks[i], options)
    }
}

function chunkSubstr(str, size) {
    const numChunks = Math.ceil(str.length / size)
    const chunks = new Array(numChunks)

    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
        chunks[i] = str.substr(o, size)
    }

    return chunks
}

function updateChatContext(chatId, role, content, name) {
    if (!chatContextMap.has(chatId)) {
        chatContextMap.set(chatId, [])
    }

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
        console.log(name, chatId, role, content.split('\n')[0])
    } catch (err) {
        // ignore this
    }
}

function buildMessageArray(chatId, isGroupChat, firstName, nextUserMessage, groupName) {
    updateChatContext(chatId, "user", nextUserMessage, firstName)

    const prompt = [{ role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You are a Telegram Bot chatting with users of the Telegram messaging platform. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable.` }]

    prompt.push({ role: "system", content: `The current Date and Time is ${new Date().toUTCString()}.` })

    if (!isGroupChat) {
        prompt.push({ role: "system", content: `You are currently assisting a user named '${firstName}' in a one-on-one private chat session.` })
    }

    if (isGroupChat) {
        prompt.push({ role: "system", content: `You are currently assisting users within a group chat setting. The group chat is called '${groupName}'.` })
    }

    // Provide admin level users with extra information they can ask about
    if (Config.TELEGRAM_BOT_ADMIN && Config.TELEGRAM_BOT_ADMIN === `${chatId}`) {
        const keys = Array.from(chatContextMap.keys()).join(',')
        prompt.push({
            role: "system", content: `Here is some additional information about the environment and user sessions. Current User Id: ${chatId}, Active User Sessions: ${keys}, User Whitelist: ${Config.TELEGRAM_ID_WHITELIST || 'empty'}`
        })
    }

    const result = [
        ...prompt,
        ...chatContextMap.get(chatId),
    ]

    return result
}

function resetMemory(chatId) {
    if (chatContextMap.has(chatId)) {
        chatContextMap.delete(chatId)
    }
}


Config.validate()

const prefix = Config.TELEGRAM_GROUP_PREFIX + " ";

BotInstance.instance().on('location', async (msg) => {
    const chatId = msg.chat.id
    if (msg.chat.type !== "private") {
        return
    }

    if (!msg.from) {
        return
    }

    updateChatContext(chatId, 'user', `Here is my location as of '${new Date().toUTCString()}': lat=${msg.location.latitude}, lon=${msg.location.longitude}`, msg.from.first_name)
    await sendMessageWrapper(chatId, `Success! Your provided location will be taken into account, if relevant, in future messages.\n\n Information: ${JSON.stringify(msg.location)}.`);
})

BotInstance.instance().on('document', async (msg) => {
    const chatId = msg.chat.id
    if (msg.chat.type !== "private") {
        return
    }

    await sendMessageWrapper(chatId, `Error: Documents and Files are not yet supported.\n\n Information: ${JSON.stringify(msg.document)}`);
})

BotInstance.instance().on('contact', async (msg) => {
    const chatId = msg.chat.id
    if (msg.chat.type !== "private") {
        return
    }

    if (!msg.from) {
        return
    }

    updateChatContext(chatId, 'user', `Here is the contact information for '${msg.contact.first_name}'. Phone Number: ${msg.contact.phone_number}`, msg.from.first_name)
    await sendMessageWrapper(chatId, `I have received the information for your provided contact '${msg.contact.first_name}'`);
})

BotInstance.instance().on('photo', async (msg) => {
    const chatId = msg.chat.id
    if (msg.chat.type !== "private") {
        return
    }

    await sendMessageWrapper(chatId, `Error: Images are not yet supported.\n\n Information: ${JSON.stringify(msg.photo)}`);
})

BotInstance.instance().on('audio', async (msg) => {
    const chatId = msg.chat.id
    if (msg.chat.type !== "private") {
        return
    }

    await sendMessageWrapper(chatId, `Error: Audio messages are not yet supported.\n\n Information: ${JSON.stringify(msg.audio)}`);
})

BotInstance.instance().on('voice', async (msg) => {
    const chatId = msg.chat.id
    if (msg.chat.type !== "private") {
        return
    }

    await sendMessageWrapper(chatId, `Error: Voice recordings are not yet supported.\n\n Information: ${JSON.stringify(msg.voice)}`);
})

BotInstance.instance().on('text', async (msg) => {
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
            await sendMessageWrapper(chatId, 'Memory has been reset');
            return
        }

        // Add some simple help text info
        if (message === "/start" || message === "/help" || message === "/about") {
            await sendMessageWrapper(chatId, 'Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-3.5 language model, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!', { parse_mode: 'Markdown' });
            return
        }

        if (message === "/debug") {
            if (Config.TELEGRAM_BOT_ADMIN && Config.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                const userKeys = Array.from(userIdToNameMap.keys()).map((key) => userIdToNameMap.get(key))
                if (userKeys.length > 0) {
                    await sendMessageWrapper(chatId, userKeys.join('\n'));
                } else {
                    await sendMessageWrapper(chatId, "There are no active user sessions");
                }

                const chatkeys = Array.from(chatContextMap.keys()).filter((chatId) => !userIdToNameMap.has(chatId))
                if (chatkeys.length > 0) {
                    await sendMessageWrapper(chatId, `There are also several IDs that do not correspond to user chats. These are usually Group Chats: \n${chatkeys.join(", ")}`);
                }
                return
            }
        }

        if (message.startsWith('/configure')) {
            if (Config.TELEGRAM_BOT_ADMIN && Config.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                const parts = message.split(" ");
                if (parts.length !== 3) {
                    return await sendMessageWrapper(chatId, `Syntax Error`);
                }

                try {
                    const chatIdParam = parseInt(parts[1])
                    const models = await OpenAI.models()

                    if (!models.includes(parts[2])) {
                        return await sendMessageWrapper(chatId, `Unknown LLM ${parts[2]}, valid options are: ${models.join(', ')}`);
                    }

                    chatIdToLLMMap.set(chatIdParam, parts[2])
                    return await sendMessageWrapper(chatId, `Chat ${parts[1]} will now use LLM ${parts[2]}`);
                } catch (err) {
                    return await sendMessageWrapper(chatId, `Error: ${err.message} \n ${err}`);
                }
            }
        }
    }

    // If the incoming text is empty or a command, ignore it for the moment
    if (message.startsWith('/')) {
        await sendMessageWrapper(chatId, 'Unknown command.');
        return
    }

    // Pull out some identifiers for helpful logging
    const firstName = msg.from.first_name || "undefined"
    const lastName = msg.from.last_name || "undefined"
    const username = msg.from.username || 'undefined'
    const userId = msg.from.id || 'undefined'
    const groupName = msg.chat.title || 'undefined'

    const identifier = `${firstName} ${lastName} [${username}] [${userId}]`

    if (!userIdToNameMap.has(userId)) {
        userIdToNameMap.set(userId, identifier)
    }

    // If a whitelist is provided check that the incoming chatId is in the list
    if (Config.TELEGRAM_ID_WHITELIST) {
        const whitelist = Config.TELEGRAM_ID_WHITELIST.trim().split(',')
        if (!whitelist.includes(`${chatId}`)) {
            await sendMessageWrapper(chatId, 'Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ' + identifier);
            console.log(`${identifier} {${chatId}}`, "sent a message but is not whitelisted")
            return
        }
    }

    // Create the message array to prompt the chat completion
    const messages = buildMessageArray(chatId, isGroupChat, firstName, message, groupName)

    // Ask OpenAI for the text completion and return the results to Telegram
    let response = null
    let model = Config.OPENAI_API_LLM
    try {
        if (chatIdToLLMMap.has(chatId)) {
            model = chatIdToLLMMap.get(chatId)
        }

        response = await OpenAI.instance().createChatCompletion({
            model: model,
            messages: messages,
        });
    } catch (err) {
        await sendMessageWrapper(chatId, 'Error: ' + err.message);

        // Clean up the chat context when something goes wrong, just in case...
        resetMemory(chatId)
        console.log("ChatId", chatId, "CreateChatCompletion Error:", err.message, '\n', err)
        return
    }

    if (response && response.data && response.data.choices) {
        // Extract the bot response 
        const result = response.data.choices[0].message || { content: "Error", role: "assistant" }

        try {
            // Send the response to the user, making sure to split the message if needed
            await sendMessageWrapper(chatId, result.content, { parse_mode: "Markdown" });
        } catch (err1) {
            console.log("ChatId", chatId, "Telegram Response Error:", err1.message, "Failed x1")

            try {
                // Send the response to the user, making sure to split the message if needed
                // If this failed once, remove the Markdown parser and try again
                await sendMessageWrapper(chatId, result.content, {});
            } catch (err2) {
                await sendMessageWrapper(chatId, 'Error: ' + err2.message);

                // Clean up the chat context when something goes wrong, just in case...
                resetMemory(chatId)
                console.log("ChatId", chatId, "Telegram Response Error:", err2.message, "Failed x2")
                return
            }
        }
        // Update our existing chat context with the result of this completion
        updateChatContext(chatId, result.role, result.content, result.role)
    }
});
