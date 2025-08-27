import { Config } from "./singletons/config";
import { Database } from "./singletons/sqlite";

import { TelegramBotInstance } from "./services/telegram/telegram";
import { CommandLineInstance } from "./services/cli/cli";
import { Logger } from "./singletons/logger";
import { ServerRESTInterface } from "./services/rest/server";

async function start() {
    // Check that all the right environment variables are set
    console.log(`OLLAMA_LLM: ${Config.OLLAMA_LLM.MODEL}, ${Config.OLLAMA_LLM.CTX}`);
    console.log(`OPENAI_LLM: ${Config.OPENAI_LLM.MODEL}, ${Config.OPENAI_LLM.CTX}`);
    console.log(`ANTHROPIC_LLM: ${Config.ANTHROPIC_LLM.MODEL}, ${Config.ANTHROPIC_LLM.CTX}`);

    console.log("");

    console.log(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    console.log(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

    await Database.init();

    const init = [];

    if (Config.TELEGRAM_ENABLED) {
        init.push(TelegramBotInstance.init());
    } else {
        console.warn("Telegram bot is disabled, set TELEGRAM_ENABLED=true to enable it");
    }

    if (Config.WEBHOOK_ENABLED) {
        init.push(ServerRESTInterface.init());
    } else {
        console.warn("Webhook is disabled, set WEBHOOK_ENABLED=true to enable it");
    }

    await Promise.all(init);

    // If we are in development mode and no other providers are enabled, run the command line interface
    const enabled = [Config.TELEGRAM_ENABLED];
    if (Config.HENNOS_DEVELOPMENT_MODE && !enabled.includes(true)) {
        Logger.debug(undefined, "Running command line interface in development mode");
        await CommandLineInstance.run();
    }
}

// Kick off the async function
start();
