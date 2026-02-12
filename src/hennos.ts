import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { TelegramInstance } from "./client/telegram";
import { DiscordInstance } from "./client/discord";
import { WebhookInstance } from "./client/api";

async function start() {
    Logger.info(undefined, "Starting Hennos...");
    await Database.init();

    Logger.info(undefined, "Initializing clients...");
    await Promise.all([
        TelegramInstance.init(),
        DiscordInstance.init(),
        WebhookInstance.init()
    ]);

    Logger.info(undefined, "Starting Temporal worker...");
    return HennosTemporalWorker.init();
}

// Kick off the async function
start();
