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

    if (Config.DISCORD_ENABLED) {
        init.push(DiscordBotInstance.init());
    } else {
        console.warn("Discord bot is disabled, set DISCORD_ENABLED=true to enable it");
    }

    if (Config.TEMPORAL_ENABLED) {
        init.push(HennosTemporalWorker.init());
    } else {
        console.warn("Temporal worker is disabled, set TEMPORAL_ENABLED=true to enable it");
    }

    if (Config.VTUBE_STUDIO_ENABLED) {
        init.push(VTubeStudioInstance.init());
    } else {
        console.warn("VTube Studio is disabled, set VTUBE_STUDIO_ENABLED=true to enable it");
    }

    if (Config.LIFEFORCE_ENABLED) {
        init.push(LifeforceBroadcast.init());
    } else {
        console.warn("Lifeforce Broadcast is disabled, set LIFEFORCE_ENABLED=true to enable it");
    }

    await Promise.all(init);

    // If we are in development mode and no other providers are enabled, run the command line interface
    const enabled = [Config.TELEGRAM_ENABLED, Config.TEMPORAL_ENABLED, Config.WEBHOOK_ENABLED, Config.VTUBE_STUDIO_ENABLED, Config.DISCORD_ENABLED];
    if (Config.HENNOS_DEVELOPMENT_MODE && !enabled.includes(true)) {
        Logger.debug(undefined, "Running command line interface in development mode");
        await CommandLineInstance.run();
    }
}

// Kick off the async function
start();
