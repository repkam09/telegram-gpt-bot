import { createWorkflowId, signalAgenticWorkflowExternalContext, signalAgenticWorkflowMessage } from "../temporal/agent/interface";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { AgentResponseHandler } from "../response";
import { App } from "@slack/bolt";
import { AppMentionEvent, WebClient } from "@slack/web-api";
import { GenericMessageEvent } from "@slack/types";

export class SlackInstance {
    private static client: WebClient;
    private static app: App;

    private static userCache: Map<string, string> = new Map();

    static async init() {
        if (!Config.SLACK_BOT_TOKEN || !Config.SLACK_SIGNING_SECRET || !Config.SLACK_APP_TOKEN) {
            Logger.error(undefined, "Missing Slack configuration. Please set SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, and SLACK_APP_TOKEN in your environment variables.");
            return;
        }

        Logger.info(undefined, "Initializing Slack client...");

        SlackInstance.client = new WebClient(Config.SLACK_BOT_TOKEN);

        SlackInstance.app = new App({
            token: Config.SLACK_BOT_TOKEN,
            signingSecret: Config.SLACK_SIGNING_SECRET,
            socketMode: true,
            appToken: Config.SLACK_APP_TOKEN,
        });

        Logger.debug(undefined, "Registering Slack event listeners...");
        AgentResponseHandler.registerListener("slack", async (message: string, chatId: string) => {
            Logger.info(undefined, `Received workflow callback for Slack in channel ${chatId}`);

            // TODO: Split and respond in 12,000 characters chunks.
            await SlackInstance.client.chat.postMessage({
                channel: chatId,
                text: message
            });
        });

        Logger.debug(undefined, "Setting up Slack app_mention event handler...");
        SlackInstance.app.event("app_mention", async ({ event }) => {
            Logger.debug(undefined, `Received Slack app_mention event: ${JSON.stringify(event)}`);
            try {
                // This will capture messages that mention the bot in channels
                const { author, workflowId } = await SlackInstance.workflowSignalAppArguments(event);
                if (event.text && event.text.trim() !== "") {
                    const cleanedText = SlackInstance.replaceBotMentions(event.text);
                    await signalAgenticWorkflowMessage(workflowId, author, cleanedText);
                }
            } catch (err) {
                Logger.error(undefined, `Error handling Slack app_mention event: ${err}`);
            }
        });

        SlackInstance.app.event("message", async ({ event }) => {
            try {
                // This will capture messages sent directly to the bot in DMs
                const genericEvent = event as unknown as GenericMessageEvent;

                // Ignore messages from bots to prevent echo loops
                if (genericEvent.bot_id) {
                    return;
                }

                if (genericEvent.text && genericEvent.text.trim() !== "") {
                    if (SlackInstance.hasBotMention(genericEvent.text || "")) {
                        Logger.debug(undefined, "Message contains bot mention, skipping to avoid duplicate handling.");
                        return;
                    }

                    Logger.debug(undefined, `Received Slack message event: ${JSON.stringify(event)}`);
                    const { author, workflowId } = await SlackInstance.workflowSignalIMArguments(genericEvent);
                    const cleanedText = SlackInstance.replaceBotMentions(genericEvent.text);
                    await signalAgenticWorkflowExternalContext(workflowId, author, cleanedText);
                }
            } catch (err) {
                Logger.error(undefined, `Error handling Slack message.im event: ${err}`);
            }
        });

        Logger.debug(undefined, "Starting Slack app...");
        await SlackInstance.app.start();

        Logger.info(undefined, "Slack client initialized and app started.");
    }

    private static async workflowSignalAppArguments(event: AppMentionEvent): Promise<{ author: string; workflowId: string; }> {
        const author = event.user ? await SlackInstance.getUserFriendlyName(event.user) : event.user_profile ? event.user_profile.display_name : event.username || "unknown";
        return {
            author,
            workflowId: await createWorkflowId("slack", event.channel),
        };
    }

    private static async workflowSignalIMArguments(event: GenericMessageEvent): Promise<{ author: string; workflowId: string; }> {
        const author = await SlackInstance.getUserFriendlyName(event.user);
        return {
            author,
            workflowId: await createWorkflowId("slack", event.channel),
        };
    }

    private static async getUserFriendlyName(userId: string): Promise<string> {
        if (SlackInstance.userCache.has(userId)) {
            return SlackInstance.userCache.get(userId)!;
        }

        try {
            const result = await SlackInstance.client.users.info({ user: userId });
            if (result.user) {
                const displayName = result.user.profile?.display_name || result.user.real_name || result.user.name;
                if (displayName) {
                    SlackInstance.userCache.set(userId, displayName);
                    return displayName;
                }
            }
        } catch (err) {
            Logger.warn(undefined, `Failed to resolve Slack user info for ${userId}: ${err}`);
        }

        // Fallback to user ID if we can't get a friendly name
        return userId;
    }

    private static replaceBotMentions(text: string): string {
        // This function can be expanded to replace bot mentions with a more user-friendly format if needed
        // "<@U0AFWMZ0FJ8>" => "Hennos"

        return text.replace("<@U0AFWMZ0FJ8>", "Hennos");
    }

    private static hasBotMention(text: string): boolean {
        return text.includes("<@U0AFWMZ0FJ8>");
    }
}