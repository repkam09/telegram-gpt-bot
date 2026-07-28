import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { TelegramInstance } from "./client/telegram";
import { WebhookInstance } from "./client/api";
import { Config } from "./singletons/config";
import { SupabaseInstance } from "./singletons/supabase";
import { createEmailScheduleWorkflow, deleteEmailScheduleWorkflow } from "./temporal/email/schedule";
import { UsageTracker } from "./temporal/usage/interface";

async function start() {
    Logger.info("Hennos", "Starting Hennos...");
    await Database.init();

    Logger.info("Hennos", "Initializing clients...");

    if (Config.HENNOS_TELEGRAM_ENABLED) {
        Logger.info("Hennos", "Initializing Telegram client...");
        await TelegramInstance.init();
    } else {
        Logger.info("Hennos", "Telegram client is disabled. Skipping...");
    }

    if (Config.HENNOS_SUPABASE_ENABLED) {
        Logger.info("Hennos", "Initializing Supabase client...");
        await SupabaseInstance.init();
    } else {
        Logger.info("Hennos", "Supabase client is disabled. Skipping...");
    }

    if (Config.HENNOS_API_ENABLED) {
        Logger.info("Hennos", "Initializing API client...");
        await WebhookInstance.init();
    } else {
        Logger.info("Hennos", "API client is disabled. Skipping...");
    }

    if (Config.HENNOS_GMAIL_ENABLED) {
        Logger.info("Hennos", "Initializing Email Schedule Workflow...");
        await createEmailScheduleWorkflow();
    } else {
        Logger.info("Hennos", "Email Schedule Workflow is disabled. Skipping...");
        await deleteEmailScheduleWorkflow();
    }

    UsageTracker.init();

    Logger.info("Hennos", "Starting Temporal worker...");
    return HennosTemporalWorker.init();
}

// Kick off the async function
start();
