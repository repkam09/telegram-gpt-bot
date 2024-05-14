import { Config } from "./singletons/config";
import { Database } from "./singletons/sqlite";
import { OpenAIWrapper } from "./singletons/openai";
import { BotInstance } from "./singletons/telegram";
import { Vector } from "./singletons/vector";
import { Logger } from "./singletons/logger";

async function start() {
    // Check that all the right environment variables are set
    Logger.log(`OPENAI_API_LLM: ${Config.OPENAI_API_LLM}`);
    Logger.log(`OPENAI_API_LIMITED_LLM: ${Config.OPENAI_API_LIMITED_LLM}`);
    Logger.log(`OLLAMA_LOCAL_LLM: ${Config.OLLAMA_LOCAL_LLM}`);
    Logger.log(`HENNOS_MAX_TOKENS: ${Config.HENNOS_MAX_TOKENS}`);
    Logger.log(`HENNOS_DEVELOPMENT_MODE: ${Config.HENNOS_DEVELOPMENT_MODE}`);

    // Create an OpenAI Instance
    OpenAIWrapper.instance();

    await Database.init();
    await Vector.init();

    BotInstance.init();
}

// Kick off the async function
start();
