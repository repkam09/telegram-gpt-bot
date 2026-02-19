import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { TelegramInstance } from "./client/telegram";
import { DiscordInstance } from "./client/discord";
import { WebhookInstance } from "./client/api";
import { SlackInstance } from "./client/slack";
import { Config } from "./singletons/config";

async function start() {
    Logger.info(undefined, "Starting Hennos...");
    await Database.init();

    Logger.info(undefined, "Initializing clients...");

    const startup = [];

    if (Config.HENNOS_TELEGRAM_ENABLED) {
        Logger.info(undefined, "Initializing Telegram client...");
        startup.push(TelegramInstance.init());
    } else {
        Logger.info(undefined, "Telegram client is disabled. Skipping...");
    }

    if (Config.HENNOS_DISCORD_ENABLED) {
        Logger.info(undefined, "Initializing Discord client...");
        startup.push(DiscordInstance.init());
    } else {
        Logger.info(undefined, "Discord client is disabled. Skipping...");
    }

    if (Config.HENNOS_SLACK_ENABLED) {
        Logger.info(undefined, "Initializing Slack client...");
        startup.push(SlackInstance.init());
    } else {
        Logger.info(undefined, "Slack client is disabled. Skipping...");
    }

    if (Config.HENNOS_API_ENABLED) {
        Logger.info(undefined, "Initializing API client...");
        startup.push(WebhookInstance.init());
    } else {
        Logger.info(undefined, "API client is disabled. Skipping...");
    }

    await Promise.all(startup);

    Logger.info(undefined, "Starting Temporal worker...");
    return HennosTemporalWorker.init();
}

// Kick off the async function
start();
