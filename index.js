import { Configuration, OpenAIApi } from "openai";
import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'

dotenv.config()

const chatContextMap = new Map();
const promptMap = new Map();

function buildConfig(prompt) {
    return {
        model: "text-davinci-003",
        prompt: prompt,
        temperature: 0.7,
        max_tokens: 512,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    }
}


function buildPrompt(chatId, firstName, message) {
    if (!promptMap.has(chatId)) {
        promptMap.set(chatId, 'default')
    }

    if (!chatContextMap.has(chatId)) {

        const mode = promptMap.get(chatId)
        if (mode === 'default') {
            const promptPrefix = `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. Here is a conversation between Hennos and the user named '${firstName}':
${firstName}: Tell me about yourself
Hennos: I'm Hennos, your friendly chat assistant! I'm here to answer questions and help you find the information you need. I'm knowledgeable on a wide range of topics, so feel free to ask away!
${firstName}: What can you help with?
Hennos: I'm knowledgeable about a wide range of topics and can provide you with helpful information and provide answers to your questions.`
            chatContextMap.set(chatId, promptPrefix)
        }

        if (mode === 'rpg') {
            const promptPrefix = `You are a creative Dungon Master for a simple text based RPG game. The player, ${firstName}, will respond with their actions based on the situations that you describe.
${firstName}: Start off by describing the magical world around us creating a simple starting hook such as being in a tavern or exploring the countryside or deep in a forest.
Hennos: `
            chatContextMap.set(chatId, promptPrefix)
            return promptPrefix
        }
    }

    const chatContext = chatContextMap.get(chatId)

    return `${chatContext}
${firstName}: ${message}
Hennos: `
}

function resetMemory(chatId) {
    if (chatContextMap.has(chatId)) {
        chatContextMap.delete(chatId)
    }
}

async function init() {
    const configuration = new Configuration({
        organization: process.env.OPENAI_API_ORG,
        apiKey: process.env.OPENAI_API_KEY,
    });

    const openai = new OpenAIApi(configuration);

    const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const message = msg.text

        if (!message) {
            return
        }

        // If the incoming text is empty or a command, ignore it for the moment
        if (message.startsWith('/')) {
            switch (message) {
                case "/reset": {
                    resetMemory(chatId)
                    bot.sendMessage(chatId, 'Memory has been reset');
                    break
                }

                case "/start": {
                    bot.sendMessage(chatId, 'Start chatting to get started!');
                    break
                }

                case '/rpg': {
                    resetMemory(chatId)
                    bot.sendMessage(chatId, 'Memory has been reset and switched to RPG mode. Start by asking something like "What do I see around me?" .');
                    promptMap.set(chatId, 'rpg')
                    break;
                }

                case '/assistant': {
                    resetMemory(chatId)
                    bot.sendMessage(chatId, 'Memory has been reset and switched to default assistant mode. Get started by asking a question.');
                    promptMap.set(chatId, 'default')
                    break
                }

                default: {
                    bot.sendMessage(chatId, `Unknown command:  ${message}. Try the following: 
- /reset: Clears the bot memory to start a whole new conversation
- /rpg: Switch to a text RPG mode where you can roleplay an adventure
- /assistant: Switch to assistant mode for general question and answer capibilities`);
                    break;
                }
            }
            return
        }

        // Pull out some identifiers for helpful logging
        const firstName = msg.chat.first_name || "Telegram User"
        const identifier = `${firstName} (${chatId})`

        // If a whitelist is provided check that the incoming chatId is in the list
        if (process.env.TELEGRAM_ID_WHITELIST) {
            const whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(',')
            if (!whitelist.includes(`${chatId}`)) {
                bot.sendMessage(chatId, 'Error: You have not been whitelisted to use this bot. Your identifier is: ' + identifier);
                console.log(identifier, "sent a message but is not whitelisted")
                return
            }
        }

        // Log the incoming request
        console.log(identifier, ":", message)

        // Ask OpenAI for the text completion and return the results to Telegram
        try {
            const prompt = buildPrompt(chatId, firstName, message)

            const response = await openai.createCompletion(buildConfig(prompt));
            if (response.data && response.data.choices) {

                // Extract the bot response 
                const result = response.data.choices[0].text

                // Send the response to the user
                bot.sendMessage(chatId, result);

                // Update our existing chat context with the result of this completion
                const chatContext = chatContextMap.get(chatId)
                const updatedChatContext = `${chatContext}
${firstName}: ${message}
Hennos: ${result}`

                chatContextMap.set(chatId, updatedChatContext)
            }
        } catch (err) {
            bot.sendMessage(chatId, 'Error: ' + err.message);

            // Clean up the chat context when something goes wrong, just in case...
            resetMemory(chatId)
            console.log("ChatId", chatId, "Response Error:", err.message)
            console.log(err)
        }
    });
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

if (process.env.TELEGRAM_ID_WHITELIST) {
    console.log("Whitelist Enabled: " + process.env.TELEGRAM_ID_WHITELIST)
}

// Start the bot and listeners
init()
