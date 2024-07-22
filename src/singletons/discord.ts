import { Client, Events, GatewayIntentBits } from "discord.js";
import { Config } from "./config";
import { Logger } from "./logger";

export class DiscordBotInstance {
    static _instance: Client;

    static async init(): Promise<void> {
        Logger.debug("Initializing Discord bot instance...");
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        await client.login(Config.DISCORD_BOT_TOKEN);

        DiscordBotInstance._instance = client;

        Logger.debug("Discord bot instance initialized.");
        client.on(Events.Debug, message => {
            Logger.debug(`Discord Debug: ${message}`);
        });

        client.once(Events.ClientReady, readyClient => {
            Logger.debug(`Ready! Logged in as ${readyClient.user.tag}`);

            readyClient.on(Events.MessageCreate, message => {
                Logger.debug(`Message received: ${message.content}`);
            });

            readyClient.on(Events.InteractionCreate, message => {
                Logger.debug(`Interaction received: ${message}`);
            });

            readyClient.on(Events.Raw, message => {
                Logger.debug(`Raw: ${message}`);
            });
        });
    }
}
