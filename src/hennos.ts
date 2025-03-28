import { Config } from "./singletons/config";
import { ScheduleJob } from "./singletons/cron";
import { Database } from "./singletons/sqlite";

import { TelegramBotInstance } from "./services/telegram/telegram";
import { CommandLineInstance } from "./services/cli/cli";
import { TwitchBotInstance } from "./services/twitch/twitch";
import { Logger } from "./singletons/logger";
import { WSServerInstance } from "./services/socket/socket";
import { MessageClassifier } from "./singletons/classifier";
import { createFollowUpJobs } from "./jobs/FollowUp";
import { ComfyHealthCheck } from "./tools/ImageGenerationTool";

async function start() {
    // Check that all the right environment variables are set
    console.log(`OLLAMA_LLM: ${Config.OLLAMA_LLM.MODEL}, ${Config.OLLAMA_LLM.CTX}`);
    console.log(`OPENAI_LLM: ${Config.OPENAI_LLM.MODEL}, ${Config.OPENAI_LLM.CTX}`);
    console.log(`ANTHROPIC_LLM: ${Config.ANTHROPIC_LLM.MODEL}, ${Config.ANTHROPIC_LLM.CTX}`);
    console.log(`GOOGLE_LLM: ${Config.GOOGLE_LLM.MODEL}, ${Config.GOOGLE_LLM.CTX}`);

    console.log(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    console.log(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

    console.log(`LOCAL_STORAGE is configured as ${Config.LOCAL_STORAGE()}`);

    await Database.init();
    await ScheduleJob.init();

    const init = [];

    if (Config.TELEGRAM_ENABLED) {
        init.push(TelegramBotInstance.init());
    } else {
        console.warn("Telegram bot is disabled, set TELEGRAM_ENABLED=true to enable it");
    }

    if (Config.CLASSIFIER_ENABLED) {
        init.push(MessageClassifier.init());
    }

    if (Config.TWITCH_ENABLED) {
        init.push(TwitchBotInstance.init());
    } else {
        console.warn("Twitch bot is disabled, set TWITCH_ENABLED=true to enable it");
    }

    if (Config.WS_SERVER_ENABLED) {
        init.push(WSServerInstance.init());
    } else {
        console.warn("Web Socket server is disabled, set WS_SERVER_ENABLED=true to enable it");
    }

    // Initialize the Follow Up Jobs
    init.push(createFollowUpJobs());

    // Initialize the ComfyUI health check
    init.push(ComfyHealthCheck.init());

    await Promise.all(init);

    // If we are in development mode and no other providers are enabled, run the command line interface
    const enabled = [Config.TELEGRAM_ENABLED, Config.TWITCH_ENABLED, Config.WS_SERVER_ENABLED];
    if (Config.HENNOS_DEVELOPMENT_MODE && !enabled.includes(true)) {
        Logger.debug(undefined, "Running command line interface in development mode");
        await CommandLineInstance.run();
    }
}

// Kick off the async function
start();
