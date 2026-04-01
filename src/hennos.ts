import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { TelegramInstance } from "./client/telegram";
import { WebhookInstance } from "./client/api";
import { Config } from "./singletons/config";
import { SupabaseInstance } from "./singletons/supabase";
import { createEmailScheduleWorkflow, deleteEmailScheduleWorkflow } from "./temporal/email/schedule";
import { createBlueskyScheduleWorkflow, deleteBlueskyScheduleWorkflow } from "./temporal/bluesky/schedule";
import { ModelContextProtocolServer } from "./client/mcp";
import { Agent2AgentProtocolServer } from "./client/a2a";
import { TelegramLegacyInstance } from "./client/legacy/legacy";

async function start() {
    Logger.info("Hennos", "Starting Hennos...");
    await Database.init();

    Logger.info("Hennos", "Initializing clients...");


    if (Config.HENNOS_TELEGRAM_ENABLED) {
        Logger.info("Hennos", "Initializing Telegram client...");
        await TelegramInstance.init();
        await TelegramLegacyInstance.init();
    } else {
        Logger.info("Hennos", "Telegram client is disabled. Skipping...");
    }

    if (Config.HENNOS_MCP_ENABLED) {
        Logger.info("Hennos", "Initializing Model Context Protocol Server...");
        await ModelContextProtocolServer.run();
    } else {
        Logger.info("Hennos", "Model Context Protocol Server is disabled. Skipping...");
    }

    if (Config.HENNOS_A2A_ENABLED) {
        Logger.info("Hennos", "Initializing Agent2Agent Protocol Server...");
        await Agent2AgentProtocolServer.init();
    } else {
        Logger.info("Hennos", "Agent2Agent Protocol Server is disabled. Skipping...");
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

    if (Config.HENNOS_BLUESKY_ENABLED) {
        Logger.info("Hennos", "Initializing Bluesky Schedule Workflow...");
        await createBlueskyScheduleWorkflow();
    } else {
        Logger.info("Hennos", "Bluesky Schedule Workflow is disabled. Skipping...");
        await deleteBlueskyScheduleWorkflow();
    }

    Logger.info("Hennos", "Starting Temporal worker...");
    return HennosTemporalWorker.init();
}

// Kick off the async function
start();
