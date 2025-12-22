import { Config } from "./singletons/config";
import { Database } from "./singletons/data/sqlite";

import { Logger } from "./singletons/logger";

import { TelegramBotInstance } from "./services/telegram/telegram";
import { CommandLineInstance } from "./services/cli/cli";
import { HennosTemporalWorker } from "./services/temporal/worker";
import { DiscordBotInstance } from "./services/discord/discord";
import { VTubeStudioInstance } from "./services/vtuber/studio";
import { LifeforceBroadcast } from "./services/events/lifeforce";

async function start() {
    Logger.info(undefined, "Starting Hennos bot...");

    // Check that all the right environment variables are set
    Logger.debug(undefined, `OLLAMA_LLM: ${Config.OLLAMA_LLM.MODEL}, ${Config.OLLAMA_LLM.CTX}`);
    Logger.debug(undefined, `OPENAI_LLM: ${Config.OPENAI_LLM.MODEL}, ${Config.OPENAI_LLM.CTX}`);
    Logger.debug(undefined, `ANTHROPIC_LLM: ${Config.ANTHROPIC_LLM.MODEL}, ${Config.ANTHROPIC_LLM.CTX}`);


    Logger.debug(undefined, `HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    Logger.debug(undefined, `HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

    await Database.init();

    const init = [];

    if (Config.TELEGRAM_ENABLED) {
        init.push(TelegramBotInstance.init());
    } else {
        Logger.warn(undefined, "Telegram bot is disabled, set TELEGRAM_ENABLED=true to enable it");
    }

    if (Config.DISCORD_ENABLED) {
        init.push(DiscordBotInstance.init());
    } else {
        Logger.warn(undefined, "Discord bot is disabled, set DISCORD_ENABLED=true to enable it");
    }

    if (Config.TEMPORAL_ENABLED) {
        init.push(HennosTemporalWorker.init());
    } else {
        Logger.warn(undefined, "Temporal worker is disabled, set TEMPORAL_ENABLED=true to enable it");
    }

    if (Config.VTUBE_STUDIO_ENABLED) {
        init.push(VTubeStudioInstance.init());
    } else {
        Logger.warn(undefined, "VTube Studio is disabled, set VTUBE_STUDIO_ENABLED=true to enable it");
    }

    init.push(LifeforceBroadcast.init());

    await Promise.all(init);

    // If we are in development mode and no other providers are enabled, run the command line interface
    const enabled = [Config.TELEGRAM_ENABLED, Config.WEBHOOK_ENABLED, Config.VTUBE_STUDIO_ENABLED, Config.DISCORD_ENABLED];
    if (Config.HENNOS_DEVELOPMENT_MODE && !enabled.includes(true)) {
        Logger.debug(undefined, "Running command line interface in development mode");
        await CommandLineInstance.run();
    }
}

// Kick off the async function
start();
