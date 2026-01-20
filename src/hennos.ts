import { Config } from "./singletons/config";
import { Logger } from "./singletons/logger";

import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { LifeforceWebhook } from "./webhook";

async function start() {
    Logger.info(undefined, "Starting Hennos Worker...");

    // Check that all the right environment variables are set
    Logger.debug(undefined, `OLLAMA_LLM: ${Config.OLLAMA_LLM.MODEL}, ${Config.OLLAMA_LLM.CTX}`);
    Logger.debug(undefined, `OPENAI_LLM: ${Config.OPENAI_LLM.MODEL}, ${Config.OPENAI_LLM.CTX}`);
    Logger.debug(undefined, `ANTHROPIC_LLM: ${Config.ANTHROPIC_LLM.MODEL}, ${Config.ANTHROPIC_LLM.CTX}`);

    Logger.debug(undefined, `HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    Logger.debug(undefined, `HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

    await Database.init();
    await LifeforceWebhook.init();
    await HennosTemporalWorker.init();
}


// Kick off the async function
start();
