import { ChannelType, Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUserAsync } from "../../singletons/user";
import { handleWhitelistedGroupMessage } from "../../handlers/text/group";
import { HennosGroupAsync } from "../../singletons/group";

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

                            const user = await HennosUserAsync(Number(message.author.id), message.author.tag, undefined, message.author.username);
                            Logger.info(user, `Received Discord message from ${message.author.tag} (${message.author.id}) in ${message.channel.id}`);
                            if (message.channel.type === ChannelType.DM) {
                                try {
                                    const response = await handlePrivateMessage(user, message.content);
                                    await message.channel.send(response);
                                } catch (err: unknown) {
                                    const error = err as Error;
                                    Logger.error(user, `Error handling Discord private message from ${message.author.tag} (${message.author.id}): ${error.message}`);
                                }
                            } else {
                                const group = await HennosGroupAsync(Number(message.channel.id), message.channel.name);
                                try {
                                    const response = await handleWhitelistedGroupMessage(user, group, message.content);
                                    await message.channel.send(response);
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