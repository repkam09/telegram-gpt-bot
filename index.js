import { Configuration, OpenAIApi } from "openai";
import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'

dotenv.config()

const chatContextMap = new Map();
const userIdToNameMap = new Map();
const chatIdToLLMMap = new Map();

async function init() {
    const configuration = new Configuration({
        organization: process.env.OPENAI_API_ORG,
        apiKey: process.env.OPENAI_API_KEY,
    });

    const openai = new OpenAIApi(configuration);

    const models = await openai.listModels()
    const knownModels = models.data.data.map((model) => model.id)

    const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });

    const prefix = process.env.TELEGRAM_GROUP_PREFIX + " ";

    bot.on('location', async (msg) => {
        const chatId = msg.chat.id
        if (msg.chat.type !== "private") {
            return
        }

        if (!msg.from) {
            return
        }

        updateChatContext(chatId, 'user', `Here is my location as of '${new Date().toUTCString()}': lat=${msg.location.latitude}, lon=${msg.location.longitude}`, msg.from.first_name)
        await sendMessageWrapper(bot, chatId, `Success! Your provided location will be taken into account, if relevant, in future messages.\n\n Information: ${JSON.stringify(msg.location)}.`);
    })

    bot.on('document', async (msg) => {
        const chatId = msg.chat.id
        if (msg.chat.type !== "private") {
            return
        }

        await sendMessageWrapper(bot, chatId, `Error: Documents and Files are not yet supported.\n\n Information: ${JSON.stringify(msg.document)}`);
    })

    bot.on('contact', async (msg) => {
        const chatId = msg.chat.id
        if (msg.chat.type !== "private") {
            return
        }

        if (!msg.from) {
            return
        }

        updateChatContext(chatId, 'user', `Here is the contact information for '${msg.contact.first_name}'. Phone Number: ${msg.contact.phone_number}`, msg.from.first_name)
        await sendMessageWrapper(bot, chatId, `I have received the information for your provided contact '${msg.contact.first_name}'`);
    })

    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id
        if (msg.chat.type !== "private") {
            return
        }

        await sendMessageWrapper(bot, chatId, `Error: Images are not yet supported.\n\n Information: ${JSON.stringify(msg.photo)}`);
    })

    bot.on('audio', async (msg) => {
        const chatId = msg.chat.id
        if (msg.chat.type !== "private") {
            return
        }

        await sendMessageWrapper(bot, chatId, `Error: Audio messages are not yet supported.\n\n Information: ${JSON.stringify(msg.audio)}`);
    })

    bot.on('voice', async (msg) => {
        const chatId = msg.chat.id
        if (msg.chat.type !== "private") {
            return
        }

        await sendMessageWrapper(bot, chatId, `Error: Voice recordings are not yet supported.\n\n Information: ${JSON.stringify(msg.voice)}`);
    })

    bot.on('text', async (msg) => {
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
                await sendMessageWrapper(bot, chatId, 'Memory has been reset');
                return
            }

            // Add some simple help text info
            if (message === "/start" || message === "/help" || message === "/about") {
                await sendMessageWrapper(bot, chatId, 'Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-3.5 language model, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!', { parse_mode: 'Markdown' });
                return
            }

            if (message === "/debug") {
                if (process.env.TELEGRAM_BOT_ADMIN && process.env.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                    const userKeys = Array.from(userIdToNameMap.keys()).map((key) => userIdToNameMap.get(key))
                    if (userKeys.length > 0) {
                        await sendMessageWrapper(bot, chatId, userKeys.join('\n'));
                    } else {
                        await sendMessageWrapper(bot, chatId, "There are no active user sessions");
                    }

                    const chatkeys = Array.from(chatContextMap.keys()).filter((chatId) => !userIdToNameMap.has(chatId))
                    if (chatkeys.length > 0) {
                        await sendMessageWrapper(bot, chatId, `There are also several IDs that do not correspond to user chats. These are usually Group Chats: \n${chatkeys.join(", ")}`);
                    }
                    return
                }
            }

            if (message.startsWith('/configure')) {
                if (process.env.TELEGRAM_BOT_ADMIN && process.env.TELEGRAM_BOT_ADMIN === `${chatId}`) {
                    const parts = message.split(" ");
                    if (parts.length !== 3) {
                        return await sendMessageWrapper(bot, chatId, `Syntax Error`);
                    }

                    try {
                        const chatIdParam = parseInt(parts[1])

                        if (!knownModels.includes(parts[2])) {
                            return await sendMessageWrapper(bot, chatId, `Unknown LLM ${parts[2]}, valid options are: ${knownModels.join(', ')}`);
                        }

                        chatIdToLLMMap.set(chatIdParam, parts[2])
                        return await sendMessageWrapper(bot, chatId, `Chat ${parts[1]} will now use LLM ${parts[2]}`);
                    } catch (err) {
                        return await sendMessageWrapper(bot, chatId, `Error: ${err.message} \n ${err}`);
                    }
                }
            }
        }

        // If the incoming text is empty or a command, ignore it for the moment
        if (message.startsWith('/')) {
            await sendMessageWrapper(bot, chatId, 'Unknown command.');
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
        if (process.env.TELEGRAM_ID_WHITELIST) {
            const whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(',')
            if (!whitelist.includes(`${chatId}`)) {
                await sendMessageWrapper(bot, chatId, 'Sorry, you have not been whitelisted to use this bot. Please request access and provide your identifier: ' + identifier);
                console.log(`${identifier} {${chatId}}`, "sent a message but is not whitelisted")
                return
            }
        }

        // Create the message array to prompt the chat completion
        const messages = buildMessageArray(chatId, isGroupChat, firstName, message, groupName)

        // Ask OpenAI for the text completion and return the results to Telegram
        let response = null
        let model = process.env.OPENAI_API_LLM
        try {
            if (chatIdToLLMMap.has(chatId)) {
                model = chatIdToLLMMap.get(chatId)
            }

            response = await openai.createChatCompletion({
                model: model,
                messages: messages,
            });
        } catch (err) {
            await sendMessageWrapper(bot, chatId, 'Error: ' + err.message);

            // Clean up the chat context when something goes wrong, just in case...
            resetMemory(chatId)
            console.log("ChatId", chatId, "CreateChatCompletion Error:", err.message, '\n', err)
            return
        }

        if (response && response.data && response.data.choices) {
            // Extract the bot response 
            const result = response.data.choices[0].message

            try {
                // Send the response to the user, making sure to split the message if needed
                await sendMessageWrapper(bot, chatId, result.content, { parse_mode: "Markdown" });
            } catch (err1) {
                console.log("ChatId", chatId, "Telegram Response Error:", err1.message, "Failed x1")

                try {
                    // Send the response to the user, making sure to split the message if needed
                    // If this failed once, remove the Markdown parser and try again
                    await sendMessageWrapper(bot, chatId, result.content, {});
                } catch (err2) {
                    await sendMessageWrapper(bot, chatId, 'Error: ' + err2.message);

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
}

async function sendMessageWrapper(bot, chatId, content, options = {}) {
    if (!content) {
        throw new Error('Message content is undefined')
    }

    if (!content.length) {
        throw new Error('Message content does not have a length property')
    }

    if (content.length < 4096) {
        return await bot.sendMessage(chatId, content, options)
    }

    const chunks = chunkSubstr(content, 4096)
    for (let i = 0; i < chunks.length; i++) {
        await bot.sendMessage(chatId, chunks[i], options)
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

    currentChatContext.push({ role, content, name })
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
console.log("Default LLM: " + process.env.OPENAI_API_LLM)

if (process.env.TELEGRAM_ID_WHITELIST) {
    console.log("Whitelist Enabled: " + process.env.TELEGRAM_ID_WHITELIST)
}

if (process.env.TELEGRAM_BOT_ADMIN) {
    console.log("Bot Admin: " + process.env.TELEGRAM_BOT_ADMIN)
}

// Start the bot and listeners
init()
