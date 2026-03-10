import { Logger } from "./singletons/logger";
import { HennosTemporalWorker } from "./worker";
import { Database } from "./database";
import { TelegramInstance } from "./client/telegram";
import { DiscordInstance } from "./client/discord";
import { WebhookInstance } from "./client/api";
import { SlackInstance } from "./client/slack";
import { Config } from "./singletons/config";
import { createEmailScheduleWorkflow, deleteEmailScheduleWorkflow } from "./temporal/email/schedule";
import { createBlueskyScheduleWorkflow, deleteBlueskyScheduleWorkflow } from "./temporal/bluesky/schedule";
import { ModelContextProtocolServer } from "./client/mcp";
import { Agent2AgentProtocolServer } from "./client/a2a";

async function start() {
    Logger.info(undefined, "Starting Hennos...");
    await Database.init();

    Logger.info(undefined, "Initializing clients...");


    if (Config.HENNOS_TELEGRAM_ENABLED) {
        Logger.info(undefined, "Initializing Telegram client...");
        await TelegramInstance.init();
    } else {
        Logger.info(undefined, "Telegram client is disabled. Skipping...");
    }

    if (Config.HENNOS_DISCORD_ENABLED) {
        Logger.info(undefined, "Initializing Discord client...");
        await DiscordInstance.init();
    } else {
        Logger.info(undefined, "Discord client is disabled. Skipping...");
    }

    if (Config.HENNOS_SLACK_ENABLED) {
        Logger.info(undefined, "Initializing Slack client...");
        await SlackInstance.init();
    } else {
        Logger.info(undefined, "Slack client is disabled. Skipping...");
    }

    if (Config.HENNOS_MCP_ENABLED) {
        Logger.info(undefined, "Initializing Model Context Protocol Server...");
        await ModelContextProtocolServer.run();
    } else {
        Logger.info(undefined, "Model Context Protocol Server is disabled. Skipping...");
    }

    if (Config.HENNOS_A2A_ENABLED) {
        Logger.info(undefined, "Initializing Agent2Agent Protocol Server...");
        await Agent2AgentProtocolServer.init();
    } else {
        Logger.info(undefined, "Agent2Agent Protocol Server is disabled. Skipping...");
    }

    if (Config.HENNOS_API_ENABLED) {
        Logger.info(undefined, "Initializing API client...");
        await WebhookInstance.init();
    } else {
        Logger.info(undefined, "API client is disabled. Skipping...");
    }

    if (Config.HENNOS_GMAIL_ENABLED) {
        Logger.info(undefined, "Initializing Email Schedule Workflow...");
        await createEmailScheduleWorkflow();
    } else {
        Logger.info(undefined, "Email Schedule Workflow is disabled. Skipping...");
        await deleteEmailScheduleWorkflow();
    }

    if (Config.HENNOS_BLUESKY_ENABLED) {
        Logger.info(undefined, "Initializing Bluesky Schedule Workflow...");
        await createBlueskyScheduleWorkflow();
    } else {
        Logger.info(undefined, "Bluesky Schedule Workflow is disabled. Skipping...");
        await deleteBlueskyScheduleWorkflow();
    }

    Logger.info(undefined, "Starting Temporal worker...");
    return HennosTemporalWorker.init();
}

// Kick off the async function
start();
