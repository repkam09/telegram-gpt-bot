import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient, createWhitelistedUser } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowMessageSignal, createWorkflowId } from "../temporal/workflows";
import { InternalCallbackHandler } from "../events/internal";
import type { BroadcastType } from "../events/internal";

export class DiscordBotInstance {
    static async init() {
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageReactions
            ],
            partials: [
                Partials.Message,
                Partials.Channel,
                Partials.Reaction
            ]
        });

        client.on(Events.ClientReady, readyClient => {
            console.log(`Logged in as ${readyClient.user.tag}!`);

            // Setting up workflow callback handler
            InternalCallbackHandler.registerHandler("discord", async (workflow: object, type: BroadcastType, message: string) => {
                if (type !== "message") {
                    Logger.error(undefined, `Unsupported broadcast type for DiscordBotInstance: ${type}`);
                    return;
                }

                const workflowObj = workflow as { userId: string, channelId: string };
                Logger.info(
                    undefined,
                    `Received workflow callback for Discord user ${workflowObj.userId} in channel ${workflowObj.channelId}, type: ${type}`
                );

                const channel = await readyClient.channels.fetch(workflowObj.channelId);
                if (channel && channel.isTextBased()) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const textChannel = channel as any;

                    // If the Response is longer than 3500 characters, split it into multiple messages
                    if (message.length > 3500) {
                        const parts = message.match(/.{1,3500}/g);
                        if (parts) {
                            for (const part of parts) {
                                await textChannel.send(part);
                            }
                        }
                    } else {
                        await textChannel.send(message);
                    }
                } else {
                    Logger.error(`Channel with ID ${workflowObj.channelId} not found or is not text-based`);
                }
            });
        });

        client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            Logger.info(undefined, `Received command: ${interaction.commandName}`);
        });

        client.on(Events.MessageCreate, async message => {
            if (message.author.bot) return; // Ignore messages from bots

            const workflowId = createWorkflowId("discord", { userId: message.author.id, channelId: message.channel.id });

            const client = await createTemporalClient();

            await client.workflow.signalWithStart(agentWorkflow, {
                taskQueue: Config.TEMPORAL_TASK_QUEUE,
                workflowId: workflowId,
                args: [{
                    user: createWhitelistedUser(message.author.id, message.author.displayName),
                    aggressiveContinueAsNew: false,
                }],
                signal: agentWorkflowMessageSignal,
                signalArgs: [message.content, new Date().toISOString()],
            });
        });

        await client.login(Config.DISCORD_BOT_TOKEN);
    }
}