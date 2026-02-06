import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { LifeforceWebhook } from "./webhook";
import { TelegramInstance } from "./client/telegram";

async function start() {
    Logger.info(undefined, "Starting Hennos Worker...");
    await Database.init();
    await LifeforceWebhook.init();
    await TelegramInstance.run();
    await HennosTemporalWorker.init();
}

// Kick off the async function
start();
