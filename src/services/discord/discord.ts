import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createDefaultUser, createTemporalClient } from "../../singletons/temporal";
import { handleHennosUserMessage, hennosUserChat, queryHennosUserMessageHandled } from "../temporal/workflows";

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

            const client = await createTemporalClient();
            const handle = await client.workflow.signalWithStart(hennosUserChat, {
                taskQueue: Config.TEMPORAL_TASK_QUEUE,
                workflowId: `discord-user:${message.author.username}-channel:${message.channelId}`,
                args: [{
                    user: createDefaultUser(message.author.id)
                }],
                signal: handleHennosUserMessage,
                signalArgs: [{ messageId: message.id, message: message.content }],
            });

            // Poll the workflow every 5 seconds to see if the message has been handled yet
            let response: false | string = false;
            while (!response) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                response = await handle.query(queryHennosUserMessageHandled, message.id);
            }

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

        await client.login(Config.DISCORD_BOT_TOKEN);
    }
}