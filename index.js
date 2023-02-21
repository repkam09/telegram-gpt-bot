import { Configuration, OpenAIApi } from "openai";
import TelegramBot from 'node-telegram-bot-api'
import * as dotenv from 'dotenv'

dotenv.config()

async function init() {
    console.log("Creating OpenAI Configuration")
    const configuration = new Configuration({
        organization: process.env.OPENAI_API_ORG,
        apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("Creating Telegram Bot Listener")
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;

        // If a whitelist is provided check that the incoming chatId is in the list
        if (process.env.TELEGRAM_ID_WHITELIST) {
            const whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(',')
            if (!whitelist.includes(`${chatId}`)) {
                bot.sendMessage(chatId, 'Error: You are not whitelisted to use this Bot instance. Your chatId is: ' + chatId);
                return
            }
        }

        const text = msg.text

        if (text.startsWith('/')) {
            return
        }

        console.log("ChatId", chatId, "Message:", text)
        try {
            const prompt = `Elaborate on the following, providing a friendly and helpful answer, writing at a college educated level: ${text}`
            console.log("ChatId", chatId, "Prompt:", prompt)

            const response = await openai.createCompletion({
                model: "text-davinci-003",
                prompt: prompt,
                temperature: 0.7,
                max_tokens: 512,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            console.log("ChatId", chatId, "Response:", response.data.id)
            if (response.data && response.data.choices) {
                bot.sendMessage(chatId, response.data.choices[0].text);
            }
        } catch (err) {
            bot.sendMessage(chatId, 'GPT Error: ' + err.message);
            console.log("ChatId", chatId, "Response Error:", err.message)
            console.log(err)
        }
    });

    console.log("Creating OpenAI Instance")
    const openai = new OpenAIApi(configuration);
}

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
    console.log("Whitelist:" + process.env.TELEGRAM_ID_WHITELIST)
}
init()
