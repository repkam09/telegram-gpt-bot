import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createDefaultUser, createTemporalClient } from "../../singletons/temporal";
import { agentWorkflow, agentWorkflowMessageSignal } from "../temporal/workflows";
import { EventManager } from "../events/events";

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
        });

        client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            Logger.info(undefined, `Received command: ${interaction.commandName}`);
        });

        client.on(Events.MessageCreate, async message => {
            if (message.author.bot) return; // Ignore messages from bots

            const workflowId = `discord-user:${message.author.username}-channel:${message.channelId}`;
            const client = await createTemporalClient();

            const emitter = EventManager.getInstance();
            emitter.createEventEmitter(workflowId);

            const result = emitter.subscribe<string>(workflowId, "agentWorkflowMessageBroadcast", async (response: string) => {
                result.unsubscribe();

                // If the Response is longer than 3500 characters, split it into multiple messages
                if (response.length > 3500) {
                    const parts = response.match(/.{1,3500}/g);
                    if (parts) {
                        for (const part of parts) {
                            await message.channel.send(part);
                        }
                    }
                } else {
                    await message.channel.send(response);
                }
            });

            await client.workflow.signalWithStart(agentWorkflow, {
                taskQueue: Config.TEMPORAL_TASK_QUEUE,
                workflowId: workflowId,
                args: [{
                    user: createDefaultUser(message.author.id, message.author.displayName),
                    aggressiveContinueAsNew: true,
                }],
                signal: agentWorkflowMessageSignal,
                signalArgs: [message.content, new Date().toISOString()],
            });
        });

        await client.login(Config.DISCORD_BOT_TOKEN);
    }
}