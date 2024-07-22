import { ChannelType, Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { Config } from "./config";
import { Logger } from "./logger";
import { handlePrivateMessage } from "../handlers/text/private";
import { HennosUserAsync } from "./user";
import { handleWhitelistedGroupMessage } from "../handlers/text/group";
import { HennosGroupAsync } from "./group";

export class DiscordBotInstance {
    static _hasCompletedInit = false;

    static async init(): Promise<void> {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (!DiscordBotInstance._hasCompletedInit) {
                    Logger.debug("Initializing Discord bot instance...");
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
                            if (message.author.bot) return;
                            if (Number(message.author.id) !== Config.DISCORD_BOT_ADMIN) {
                                Logger.debug(`Ignoring message from non-admin user ${message.author.tag} (${message.author.id})`);
                                return;
                            }

                            const user = await HennosUserAsync(Number(message.author.id), message.author.tag, undefined, message.author.username);
                            Logger.info(user, `Received Discord message from ${message.author.tag} (${message.author.id}) in ${message.channel.id}`);
                            if (message.channel.type === ChannelType.DM) {
                                const response = await handlePrivateMessage(user, message.content);
                                await message.channel.send(response);
                            } else {
                                const group = await HennosGroupAsync(Number(message.channel.id), message.channel.name);
                                const response = await handleWhitelistedGroupMessage(user, group, message.content);
                                await message.channel.send(response);
                            }
                        });
                        Logger.debug(`Ready! Logged in as ${readyClient.user.tag}`);
                    });
                }

                if (DiscordBotInstance._hasCompletedInit) {
                    clearInterval(interval);
                    Logger.debug("Finished initializing Discord bot instance.");
                    return resolve();
                }
            }, 5000);
        });
    }
}