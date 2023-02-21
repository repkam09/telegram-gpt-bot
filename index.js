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

        // Only answer things that look like questions from group chats...
        if (chatId < 0) {
            if (!text.trim().endsWith('?')) {
                return
            }
        }

        console.log("ChatId", chatId, "Message:", text)
        try {
            const response = await openai.createCompletion({
                model: "text-davinci-003",
                prompt: `I am a highly intelligent question answering bot. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, or has no clear answer, I will respond with \"Unknown\".\n\nQ: What is human life expectancy in the United States?\nA: Human life expectancy in the United States is 78 years.\n\nQ: Who was president of the United States in 1955?\nA: Dwight D. Eisenhower was president of the United States in 1955.\n\nQ: Which party did he belong to?\nA: He belonged to the Republican Party.\n\nQ: What is the square root of banana?\nA: Unknown\n\nQ: How does a telescope work?\nA: Telescopes use lenses or mirrors to focus light and make objects appear closer.\n\nQ: Where were the 1992 Olympics held?\nA: The 1992 Olympics were held in Barcelona, Spain.\n\nQ: How many squigs are in a bonk?\nA: Unknown\n\nQ: ${text}\nA:`,
                temperature: 0,
                max_tokens: 100,
                top_p: 1,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                stop: ["\n"],
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
