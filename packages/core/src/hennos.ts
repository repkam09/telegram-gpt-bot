import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { LifeforceWebhook } from "./webhook";

async function start() {
    Logger.info(undefined, "Starting Hennos Worker...");
    await Database.init();
    await LifeforceWebhook.init();
    await HennosTemporalWorker.init();
}

// Kick off the async function
start();
