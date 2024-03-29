import { Config } from "./singletons/config";
import { Database } from "./singletons/sqlite";
import { OpenAIWrapper } from "./singletons/openai";
import { BotInstance } from "./singletons/telegram";
import { Vector } from "./singletons/vector";
import { Logger } from "./singletons/logger";

async function start() {
    // Check that all the right environment variables are set
    Logger.debug(`OPENAI_API_LLM: ${Config.OPENAI_API_LLM}`);
    Logger.debug(`OLLAMA_LLM: ${Config.OLLAMA_LLM}`);
    
    Logger.debug(`HENNOS_MAX_TOKENS: ${Config.HENNOS_MAX_TOKENS}`);
    Logger.debug(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);
    Logger.debug(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    
    // Create an OpenAI Instance
    OpenAIWrapper.instance();

    await Database.init();
    await Vector.init();

    BotInstance.init();
}

// Kick off the async function
start();
