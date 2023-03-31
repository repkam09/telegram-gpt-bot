// @ts-check

import TelegramBot from "node-telegram-bot-api"

/**
 * @type { Map<string, {content: string, role: string}[]>() } CHAT_CONTEXT_MAP
 */
const CHAT_CONTEXT_MAP = new Map()



export class ChatMemoryMap {
    /**
     * 
     * @param {{id: TelegramBot.User['id'], name: TelegramBot.User['first_name'], chat: TelegramBot.Chat['id']}} user 
     * @param {string} content 
     * @param {string} role 
     * @returns {{content: string, role: string}[]}
     */
    static appendPrivateMessage(user, content, role) {
        return updateChatContextMap(user.id, content, role)
    }

    static appendGroupMessage(user, content, role) {
        return updateChatContextMap(user.chat, `${user.name}: ${content}`, role)
    }

    static getSessions() {
        return Array.from(CHAT_CONTEXT_MAP.keys())
    }

    static getGroupMessages(user) {

    }

    static getPrivateMessages(user) {

    }

    static clearForKey(key) {
        CHAT_CONTEXT_MAP.set(key, [])
    }
}

function getMessages(key) {
    if (!CHAT_CONTEXT_MAP.has(key)) {
        CHAT_CONTEXT_MAP.set(key, [])
    }

    return CHAT_CONTEXT_MAP.get(key)
}

function getGroupSystemBasePrompts(user) {
    return [
        { role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly.` },
        { role: "system", content: "You are a Telegram Bot chatting with users of the Telegram messaging platform." },
        { role: "system", content: "You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable." },
        { role: "system", content: `You are currently assisting users within a group chat setting.` }
    ]
}

function getPrivateSystemBasePrompts(user) {
    return [
        { role: "system", content: `You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly.` },
        { role: "system", content: "You are a Telegram Bot chatting with users of the Telegram messaging platform." },
        { role: "system", content: "You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable." },
        { role: "system", content: `You are currently assisting a user named '${user.name}' in a one-on-one private chat session.` }
    ]
}

/**
 * 
 * @param {string} key 
 * @param {string} content 
 * @param {string} role 
 * @returns {{content: string, role: string}[]}
 */
function updateChatContextMap(key, content, role) {
    if (!CHAT_CONTEXT_MAP.has(key)) {
        CHAT_CONTEXT_MAP.set(key, [])
    }

    const current = CHAT_CONTEXT_MAP.get(key)
    if (!current) {
        throw new Error("Missing chat context for id ", key)
    }

    if (current.length > 10) {
        // Remove the oldest user message from memory
        current.shift()
        // Remove the oldest assistant message from memory
        current.shift()
    }

    current.push({ role, content })
    CHAT_CONTEXT_MAP.set(key, current)

    return current
}