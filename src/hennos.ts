import { Config } from "./singletons/config";
import { Database } from "./singletons/sqlite";
import { OllamaWrapper } from "./singletons/ollama";
import { BotInstance } from "./singletons/telegram";
import { Vector } from "./singletons/vector";

async function start() {
    // Check that all the right environment variables are set
    console.log(`OLLAMA_LLM: ${JSON.stringify(Config.OLLAMA_LLM)}`);
    console.log(`OLLAMA_LLM_LARGE: ${JSON.stringify(Config.OLLAMA_LLM_LARGE)}`);

    console.log(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

    // Create an OpenAI Instance
    OllamaWrapper.instance();

    await Database.init();
    await Vector.init();

    BotInstance.init();
}

// Kick off the async function
start();
