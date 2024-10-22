import { Config } from "./singletons/config";
import { ScheduleJob } from "./singletons/cron";
import { Database } from "./singletons/sqlite";

import { DiscordBotInstance } from "./services/discord/discord";
import { TelegramBotInstance } from "./services/telegram/telegram";
import { CommandLineInstance } from "./services/cli/cli";
import Koa from "koa";
import { setupKoaRoutes } from "./routes/koaRoutes";

async function start() {
    // Check that all the right environment variables are set
    console.log(`OLLAMA_LLM: ${Config.OLLAMA_LLM.MODEL}`);
    console.log(`OPENAI_LLM: ${Config.OPENAI_LLM.MODEL}`);
    console.log(`ANTHROPIC_LLM: ${Config.ANTHROPIC_LLM.MODEL}`);

    console.log(`HENNOS_DEVELOPMENT_MODE is configured as ${Config.HENNOS_DEVELOPMENT_MODE}`);
    console.log(`HENNOS_VERBOSE_LOGGING is configured as ${Config.HENNOS_VERBOSE_LOGGING}`);

    console.log(`LOCAL_STORAGE is configured as ${Config.LOCAL_STORAGE()}`);

    await Database.init();
    await ScheduleJob.init();

    if (Config.TELEGRAM_ENABLED) {
        await TelegramBotInstance.init();
    } else {
        console.warn("Telegram bot is disabled, set TELEGRAM_ENABLED=true to enable it");
    }

    if (Config.DISCORD_ENABLED) {
        await DiscordBotInstance.init();
    } else {
        console.warn("Discord bot is disabled, set DISCORD_ENABLED=true to enable it");
    }

    // If we are in development mode and neither telegram nor discord are enabled, run the command line interface
    if (!Config.TELEGRAM_ENABLED && !Config.DISCORD_ENABLED && Config.HENNOS_DEVELOPMENT_MODE) {
        await CommandLineInstance.run();
    }

    // Initialize Koa server and define routes
    const app = new Koa();
    setupKoaRoutes(app);

    // Start the Koa server and listen on the specified port
    const port = process.env.HENNOS_API_PORT || 3000;
    app.listen(port, () => {
        console.log(`Koa server running on port ${port}`);
    });
}

// Kick off the async function
start();
