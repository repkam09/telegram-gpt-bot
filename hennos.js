// @ts-check

import * as dotenv from 'dotenv'

import { TGPTBot } from "./src/TGPTBot.js"
import { Logger } from "./src/Logger.js"

dotenv.config()

let whitelist = [];
if (process.env.TELEGRAM_ID_WHITELIST) {
    whitelist = process.env.TELEGRAM_ID_WHITELIST.trim().split(',')
}

const options = {
    whitelist: whitelist,
    owner: process.env.TELEGRAM_BOT_ADMIN,
    defaultModel: process.env.OPENAI_API_LLM,
    groupPrefix: process.env.TELEGRAM_GROUP_PREFIX,
    logger: new Logger()
}

const bot = new TGPTBot(options)

bot.setSystemPrivatePromptFn((user) => ([
    { role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly.` },
    { role: "system", content: "You are a Telegram Bot chatting with users of the Telegram messaging platform." },
    { role: "system", content: "You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable." },
    { role: "system", content: `You are currently assisting a user named '${user.name}' in a one-on-one private chat session.` }
]))

bot.setSystemGroupPromptFn(() => ([
    { role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly.` },
    { role: "system", content: "You are a Telegram Bot chatting with users of the Telegram messaging platform." },
    { role: "system", content: "You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable." },
    { role: "system", content: `You are currently assisting users within a group chat setting.` }
]))

bot.enable()