import { Config } from "./singletons/config";
import { Database } from "./singletons/sqlite";
import { OpenAIWrapper } from "./singletons/openai";
import { BotInstance } from "./singletons/telegram";
import { Vector } from "./singletons/vector";

async function start() {
    // Check that all the right environment variables are set
    console.log(`OPENAI_API_LLM: ${Config.OPENAI_API_LLM}`);
    console.log(`OLLAMA_LLM: ${Config.OLLAMA_LLM}`);
    console.log(`HENNOS_MAX_TOKENS: ${Config.HENNOS_MAX_TOKENS}`);
    console.log(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);
    console.log(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);

    // Create an OpenAI Instance
    OpenAIWrapper.instance();

    await Database.init();
    await Vector.init();

    BotInstance.init();
}

// Kick off the async function
start();
