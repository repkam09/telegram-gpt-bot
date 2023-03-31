// @ts-check

import TelegramBot from "node-telegram-bot-api"

/**
 * @param {any} options 
 * @returns {number[]}
 */
export function parseWhitelist(options) {
    if (!options.whitelist) {
        return []
    }

    if (!Array.isArray(options.whitelist)) {
        throw new Error("Whitelist should be an array")
    }

    const whitelist = options.whitelist.map((entry) => {
        try {
            return parseInt(entry)
        } catch (err) {
            throw new Error("Whilist should be an array of numbers")
        }
    })

    return whitelist
}

/**
 * @param {any} options 
 * @returns {number | null}
 */
export function parseOwner(options) {
    if (!options.owner) {
        return null
    }

    try {
        return parseInt(options.owner)
    } catch (err) {
        throw new Error("Owner should be a number representing a Telegram userId")
    }
}

/**
 * @param {any} options 
 * @returns {string}
 */
export function parseDefaultModel(options) {
    if (!options.defaultModel) {
        return 'gpt-3.5-turbo'
    }

    return options.defaultModel
}

/**
 * @param {any} options 
 * @returns {string}
 */
export function parseGroupPrefix(options) {
    if (!options.groupPrefix) {
        return ''
    }

    return options.groupPrefix
}

/**
 * 
 * @param {any} options 
 * @returns {any}
 */
export function parseLogger(options) {
    if (!options.logger) {
        return {
            info() {
                console.log(...arguments)
            },
            warn() {
                console.warn(...arguments)
            },
            debug() {
                console.debug(...arguments)
            },
            error() {
                console.error(...arguments)
            }
        }
    }

    return options.logger
}


/**
 * 
 * @param {TelegramBot} bot 
 * @param {number} id
 * @param {string} content 
 */
export async function sendMessageWrapper(bot, id, content) {
    const chunks = chunkSubstr(content, 4096)
    for (let i = 0; i < chunks.length; i++) {
        await bot.sendMessage(id, chunks[i], { parse_mode: "Markdown" })
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
