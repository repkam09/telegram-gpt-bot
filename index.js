import { Configuration, OpenAIApi } from "openai";
import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'

dotenv.config()


function buildConfig(name, text) {
    return {
        model: "text-davinci-003",
        prompt: buildPrompt(name, text),
        temperature: 0.7,
        max_tokens: 512,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    }
}

function buildPrompt(name, text) {
    return `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. Here is an example conversation between Hennos and the user named ${name}.

${name}: What can you help with? 

Hennos: I'm Hennos, your friendly chat assistant here to help answer your questions. I'm knowledgeable about a wide range of topics and can provide you with helpful information and answer your questions.
    
${name}: What is the James Webb Space Telescope?

Hennos: The James Webb Space Telescope (JWST) is a space telescope currently conducting infrared astronomy. As the largest optical telescope in space, it is equipped with high-resolution and high-sensitivity instruments, allowing it to view objects too old, distant, or faint for the Hubble Space Telescope. This enables investigations across many fields of astronomy and cosmology, such as observation of the first stars, the formation of the first galaxies, and detailed atmospheric characterization of potentially habitable exoplanets.

${name}: Who is George Lucas?

Hennos: George Walton Lucas Jr. is an American filmmaker. Lucas is best known for creating the Star Wars and Indiana Jones franchises and founding Lucasfilm, LucasArts, Industrial Light & Magic and THX. He served as chairman of Lucasfilm before selling it to The Walt Disney Company in 2012.

${name}: ${text}    

Hennos: `
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
        const text = msg.text

        // If the incoming text is empty or a command, ignore it for the moment
        if (!text || text.startsWith('/')) {
            return
        }

        // Pull out some identifiers for helpful logging
        const username = msg.chat.first_name || "Telegram User"
        const identifier = `${username} (${chatId})`

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
        console.log(identifier, ":", text)

        // Ask OpenAI for the text completion and return the results to Telegram
        try {
            const response = await openai.createCompletion(buildConfig(username, text));
            if (response.data && response.data.choices) {
                bot.sendMessage(chatId, response.data.choices[0].text);
            }
        } catch (err) {
            bot.sendMessage(chatId, 'Error: ' + err.message);
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
