// @ts-check

import TelegramBot from 'node-telegram-bot-api'
import { Configuration, OpenAIApi } from "openai";
import { parseWhitelist, parseOwner, parseGroupPrefix, parseDefaultModel, parseLogger, sendMessageWrapper } from "./helpers/utils.js"

/**
 * @typedef {{id: TelegramBot.User['id'], name: TelegramBot.User['first_name'], chat: TelegramBot.Chat['id']}} TGPTUser
 * @typedef {{role: string, content: string}} TGPTChatEntry
 * @typedef {(user: TGPTUser) => TGPTChatEntry[]} TGPTChatEntryBuilder
 * @typedef {{info: (...args: any[]) => void, warn: (...args: any[]) => void, debug: (...args: any[]) => void, error: (...args: any[]) => void}} TGPTLogger
 */

export class TGPTBot {
    constructor(options = {}) {
        // These three secrets must be set via environment variable
        if (!process.env.OPENAI_API_ORG) {
            throw new Error("Missing OPENAI_API_ORG")
        }

        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY")
        }

        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY")
        }

        /**
         * @type {TGPTLogger}
         */
        this.logger = parseLogger(options)

        /**
         * @type {TGPTChatEntryBuilder} 
         */
        this.systemPrivatePromptFn = () => []

        /**
         * @type {TGPTChatEntryBuilder} 
         */
        this.systemGroupPromptFn = () => []

        /**
         * @type {number[]}
         */
        this.whitelist = parseWhitelist(options)

        /**
         * @type {number | null}
         */
        this.owner = parseOwner(options);

        /**
         * @type {string}
         */
        this.groupPrefix = parseGroupPrefix(options)

        /**
         * @type {string}
         */
        this.defaultModel = parseDefaultModel(options)

        /**
         * @type {TelegramBot}
         */
        this.telegrambot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });

        /**
         * @type {OpenAIApi}
         */
        this.openai = new OpenAIApi(new Configuration({
            organization: process.env.OPENAI_API_ORG,
            apiKey: process.env.OPENAI_API_KEY,
        }));
    }


    /**
     * @param {TGPTChatEntryBuilder} fn
     */
    setSystemPrivatePromptFn(fn) {
        this.systemPrivatePromptFn = fn;
    }

    /**
     * @param {TGPTChatEntryBuilder} fn
     */
    setSystemGroupPromptFn(fn) {
        this.systemGroupPromptFn = fn;
    }

    /**
     * @returns {string[]}
     */
    getKnownModels() {
        return []
    }

    /**
     * @returns {number[]}
     */
    getActiveSessions() {
        return []
    }

    /**
     * @returns {void}
     */
    setModelForSession(id, model) {

    }

    /**
     * @returns {void}
     */
    enable() {
        this.telegrambot.addListener('message', this.handleIncomingMessage.bind(this))
    }

    /**
     * @returns {void}
     */
    disable() {
        this.telegrambot.removeListener('message', this.handleIncomingMessage.bind(this));
    }

    /**
     * @returns {Promise<void>}
     */
    async handleOutgoingMessage(chatId, message) {
        return sendMessageWrapper(this.telegrambot, chatId, message)
    }

    /**
     * 
     * @param {TelegramBot.Message} msg 
     */
    async handleIncomingMessage(msg) {
        if (!msg) {
            this.logger.debug("Message is undefined, ignoring")
            return
        }

        if (!msg.text) {
            this.logger.debug("Message did not have a text field, ignoring")
            return
        }

        if (!msg.from) {
            this.logger.debug("Message did not have a from field, ignoring")
            return
        }

        const user = { id: msg.from.id, name: msg.from.first_name, chat: msg.chat.id }
        const text = msg.text;
        const type = msg.chat.type

        if (text.startsWith('/')) {
            if (type !== 'private') {
                this.logger.debug(`Incoming Command message from ${user.name} (${user.id}), ignored due to Chat type`)
                return
            }

            this.logger.debug(`Incoming Command message from ${user.name} (${user.id})`)
            return this.handleIncomingCommandMessage(text, user)
        }

        if (type === 'private') {
            if (this.whitelist.length > 0 && !this.whitelist.includes(user.chat)) {
                this.logger.debug(`Incoming Private message from ${user.name} (${user.id}), ignored due to whitelist`)
                return this.handleOutgoingMessage(user.id, `You have not been whitelisted to use this bot.`)
            }

            this.logger.debug(`Incoming Private message from ${user.name} (${user.id})`)
            return this.handleIncomingPrivateMessage(text, user)
        }

        if (type === 'group' || type === 'supergroup') {
            if (this.whitelist.length > 0 && !this.whitelist.includes(user.chat)) {
                this.logger.debug(`Incoming Group message from ${user.name} (${user.id}) in chat ${user.chat}, ignored due to whitelist`)
                return
            }

            if (text.startsWith(this.groupPrefix)) {
                this.logger.debug(`Incoming Group message from ${user.name} (${user.id}) in chat ${user.chat}`)
                const cleanText = text.replace(this.groupPrefix, "")
                return this.handleIncomingGroupMessage(cleanText, user)
            }
        }
    }

    /**
     * 
     * @param {string} message 
     * @param {TGPTUser} user 
     */
    async handleIncomingCommandMessage(message, user) {
        if (!this.owner) {
            return this.logger.debug(`Ignoring command because owner is not set`)
        }

        if (this.owner !== user.id) {
            return this.logger.debug(`Ignoring command because user is not the owner`)
        }

        if (message === '/reset') {
            await clearSessionHistory(user.chat)
            await this.handleOutgoingMessage(user.id, "Chat memory context has been reset. The bot will no longer remember any of the previous conversation.")
            return
        }

        if (message === "/start" || message === "/help" || message === "/about") {
            await this.handleOutgoingMessage(user.id, 'Hennos is a conversational chat assistant powered by the OpenAI API using their GPT language models, similar to ChatGPT. \n\nFor more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).\n\nYou can get started by asking a question!');
            return
        }

        if (message === "/sessions") {
            const sessions = this.getActiveSessions()
            await this.handleOutgoingMessage(user.id, `Sessions: ${sessions.join(", ")}`)
            return
        }

        if (message.startsWith("/configure")) {
            const parts = message.split(" ");
            if (parts.length !== 3) {
                return await this.handleOutgoingMessage(user.id, `Error: Expected /configure [chatId] [modelName]`);
            }

            const models = await this.getKnownModels()
            if (!models.includes(parts[2])) {
                return await this.handleOutgoingMessage(user.id, `Unable to set Model '${parts[2]}' for ChatID ${parts[1]}. \nModel must be one of: \n${models.join(", ")}`);

            }

            try {
                this.setModelForSession(parseInt(parts[1]), parts[2])
                return await this.handleOutgoingMessage(user.id, `Conversation with ChatId ${parts[1]} will now use OpenAI Model '${parts[2]}'`);
            } catch (err) {
                return await this.handleOutgoingMessage(user.id, `Unable to set Model '${parts[2]}' for ChatID ${parts[1]}, error: ${err.message}`);
            }
        }

        return await this.handleOutgoingMessage(user.id, `Unknown Command`);
    }

    /**
     * 
     * @param {string} message 
     * @param {{id: TelegramBot.User['id'], name: TelegramBot.User['first_name'], chat: TelegramBot.Chat['id']}} user 
     */
    async handleIncomingPrivateMessage(message, user) {
        this.handleOutgoingMessage(user.id, "Private Message Response")
    }

    /**
     * 
     * @param {string} message 
     * @param {{id: TelegramBot.User['id'], name: TelegramBot.User['first_name'], chat: TelegramBot.Chat['id']}} user 
     */
    async handleIncomingGroupMessage(message, user) {
        this.handleOutgoingMessage(user.id, "Group Message Response")
    }
}

function clearSessionHistory(key) {

}