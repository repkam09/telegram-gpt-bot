import { Config } from "./singletons/config";
import { ScheduleJob } from "./singletons/cron";
import { DiscordBotInstance } from "./singletons/discord";
import { Database } from "./singletons/sqlite";
import { TelegramBotInstance } from "./singletons/telegram";

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

    await TelegramBotInstance.init();
    await DiscordBotInstance.init();
}

// Kick off the async function
start();
