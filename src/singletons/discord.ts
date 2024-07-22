import { Client, Events, GatewayIntentBits } from "discord.js";
import { Config } from "./config";

export class DiscordBotInstance {
    static _instance: Client;

    static async init(): Promise<void> {
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        await client.login(Config.DISCORD_BOT_TOKEN);

        client.once(Events.ClientReady, readyClient => {
            console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        });

        DiscordBotInstance._instance = client;
    }
}
