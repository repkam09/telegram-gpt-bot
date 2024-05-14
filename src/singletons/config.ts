import * as dotenv from "dotenv";
dotenv.config();

export class Config {
    /**
    * The default OpenAI API key to use for whitelisted user requests
    * 
    * See: https://platform.openai.com/docs/api-reference/authentication
    */
    static get OPENAI_API_KEY(): string {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        return process.env.OPENAI_API_KEY;
    }

    /**
     * The default OpenAI API key to use for non-whitelisted user requests
     * 
     * Seee: https://platform.openai.com/docs/api-reference/authentication
     */
    static get OPENAI_API_KEY_LIMITED(): string {
        if (!process.env.OPENAI_API_KEY_LIMITED) {
            throw new Error("Missing OPENAI_API_KEY_LIMITED");
        }

        return process.env.OPENAI_API_KEY_LIMITED;
    }

    /**
     * The default OpenAI LLM to use for whitelisted user requests
     * 
     * See: https://platform.openai.com/docs/api-reference/models
     */
    static get OPENAI_API_LLM() {
        if (!process.env.OPENAI_API_LLM) {
            throw new Error("Missing OPENAI_API_LLM");
        }

        return process.env.OPENAI_API_LLM;
    }

    /**
     * The default OpenAI LLM to use for non-whitelisted user requests
     * 
     * See: https://platform.openai.com/docs/api-reference/models
     */
    static get OPENAI_API_LIMITED_LLM() {
        if (!process.env.OPENAI_API_LIMITED_LLM) {
            throw new Error("Missing OPENAI_API_LIMITED_LLM");
        }

        return process.env.OPENAI_API_LIMITED_LLM;
    }

    /**
     * The maximum number of tokens that should be provided
     * to the API in a single request
     * 
     * At maximum this should be the context limit of the model
     * 
     * See: https://platform.openai.com/tokenizer
     */
    static get HENNOS_MAX_TOKENS(): number {
        if (!process.env.HENNOS_MAX_TOKENS) {
            return 4096;
        }

        const limit = parseInt(process.env.HENNOS_MAX_TOKENS);
        if (Number.isNaN(limit)) {
            throw new Error("Invalid HENNOS_MAX_TOKENS value");
        }

        return limit;
    }

    /**
     * The Ollama hosted LLM to use for local requests
     * 
     * See: https://ollama.com/
     */
    static get OLLAMA_LOCAL_LLM(): string {
        if (!process.env.OLLAMA_LOCAL_LLM) {
            throw new Error("Missing OLLAMA_LOCAL_LLM");
        }

        return process.env.OLLAMA_LOCAL_LLM;
    }

    /**
     * The Ollama host to use for local requests
     */
    static get OLLAMA_LOCAL_HOST(): string {
        if (!process.env.OLLAMA_LOCAL_HOST) {
            return "localhost";
        }

        return process.env.OLLAMA_LOCAL_HOST;
    }

    /**
     * The Ollama port to use for local requests
     */
    static get OLLAMA_LOCAL_PORT(): number {
        if (!process.env.OLLAMA_LOCAL_PORT) {
            return 11434;
        }

        const port = parseInt(process.env.OLLAMA_LOCAL_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid OLLAMA_LOCAL_PORT value");
        }

        return port;
    }

    /**
     * The Key to use for the Telegram Bot API
     * 
     * See: https://core.telegram.org/bots/api
     */
    static get TELEGRAM_BOT_KEY(): string {
        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        return process.env.TELEGRAM_BOT_KEY;
    }

    /**
     * The prefix to use for Telegram group messages. This
     * creates a requirement that the user @ the bot directly
     */
    static get TELEGRAM_GROUP_PREFIX(): string {
        if (!process.env.TELEGRAM_GROUP_PREFIX) {
            throw new Error("Missing TELEGRAM_GROUP_PREFIX");
        }

        return process.env.TELEGRAM_GROUP_PREFIX + " ";
    }

    /**
     * The Telegram User ID of the bot owner
     */
    static get TELEGRAM_BOT_ADMIN(): number {
        if (!process.env.TELEGRAM_BOT_ADMIN) {
            return -1;
        }

        const adminId = parseInt(process.env.TELEGRAM_BOT_ADMIN);
        if (Number.isNaN(adminId)) {
            throw new Error("Invalid TELEGRAM_BOT_ADMIN");
        }

        return adminId;
    }

    /**
     * Sets the development mode for the bot. Enables more logging,
     * forces Ollama mode, and limits access to only the admin user.
     */
    static get HENNOS_DEVELOPMENT_MODE(): boolean {
        if (!process.env.HENNOS_DEVELOPMENT_MODE) {
            return false;
        }

        return process.env.HENNOS_DEVELOPMENT_MODE === "true";
    }
}
