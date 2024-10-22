import { ChannelType, Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handlePrivateMessage } from "../../handlers/text/private";
import { handleWhitelistedGroupMessage } from "../../handlers/text/group";
import { HennosUser } from "../../singletons/user";
import { HennosGroup } from "../../singletons/group";
import { HennosConsumer, HennosResponse } from "../../singletons/base";

export class DiscordBotInstance {
    static _hasCompletedInit = false;

    static async init(): Promise<void> {
        return new Promise((resolve) => {
            // This init process is a bit weird, it doesnt always seem to work, so potentially try a few times...
            const interval = setInterval(() => {
                if (!DiscordBotInstance._hasCompletedInit) {
                    console.log("Initializing Discord bot instance...");
                    const client = new Client({
                        intents: [
                            GatewayIntentBits.Guilds,
                            GatewayIntentBits.GuildMessages,
                            GatewayIntentBits.MessageContent,
                            GatewayIntentBits.DirectMessages,
                            GatewayIntentBits.DirectMessageReactions,
                        ],
                        partials: [
                            Partials.Message,
                            Partials.Channel,
                            Partials.Reaction
                        ]
                    });
                    client.login(Config.DISCORD_BOT_TOKEN);

                    client.once(Events.ClientReady, readyClient => {
                        if (DiscordBotInstance._hasCompletedInit) {
                            Logger.debug("Discord Client has already completed initialization.");
                            return;
                        }
                        DiscordBotInstance._hasCompletedInit = true;
                        readyClient.on(Events.MessageCreate, async message => {
                            // Ignore messages from bots (this includes ourself because discord is weird)
                            if (message.author.bot) return;

                            // Right now only let the admin send messages to the bot
                            if (Number(message.author.id) !== Config.DISCORD_BOT_ADMIN) {
                                Logger.debug(`Ignoring discord message from non-admin user ${message.author.tag} (${message.author.id})`);
                                return;
                            }

                            const user = await HennosUser.async(Number(message.author.id), message.author.tag, undefined, message.author.username);

                            // Check if the user is blacklisted
                            const blacklisted = await HennosConsumer.isBlacklisted(user.chatId);
                            if (blacklisted) {
                                Logger.info(user, `Ignoring message from blacklisted user. User was blacklisted at: ${blacklisted.datetime.toISOString()}`);
                                return;
                            }

                            Logger.info(user, `Received Discord message from ${message.author.tag} (${message.author.id}) in ${message.channel.id}`);
                            if (message.channel.type === ChannelType.DM) {
                                try {
                                    const response = await handlePrivateMessage(user, message.content);
                                    await handleHennosResponse(response, message.channel);
                                } catch (err: unknown) {
                                    const error = err as Error;
                                    Logger.error(user, `Error handling Discord private message from ${message.author.tag} (${message.author.id}): ${error.message}`);
                                }
                            } else {
                                const group = await HennosGroup.async(Number(message.channel.id), message.channel.name);

                                // Check if the group is blacklisted
                                const blacklisted = await HennosConsumer.isBlacklisted(group.chatId);
                                if (blacklisted) {
                                    Logger.info(user, `Ignoring message from blacklisted group. Group was blacklisted at: ${blacklisted.datetime.toISOString()}`);
                                    return;
                                }

                                try {
                                    const response = await handleWhitelistedGroupMessage(user, group, message.content);
                                    await handleHennosResponse(response, message.channel);
                                } catch (err: unknown) {
                                    const error = err as Error;
                                    Logger.error(user, `Error handling Discord group message from ${message.author.tag} (${message.author.id}): ${error.message}`);
                                }
                            }
                        });
                        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
                    });
                }

                if (DiscordBotInstance._hasCompletedInit) {
                    clearInterval(interval);
                    console.log("Finished initializing Discord bot instance.");
                    return resolve();
                }
            }, 5000);
        });
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleHennosResponse(response: HennosResponse, channel: any): Promise<void> {
    switch (response.__type) {
        case "string": {
            return channel.send(response.payload);
        }

        case "error": {
            return channel.send(response.payload);
        }

        case "empty": {
            return Promise.resolve();
        }

        case "arraybuffer": {
            return Promise.resolve();
        }
    }
}