import tmi from "tmi.js";
import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/user";
import { Logger } from "../../singletons/logger";
import { HennosGroup } from "../../singletons/group";
import { handleOneOffGroupMessage } from "../../handlers/text/group";

export class TwitchBotInstance {

    private static _client: tmi.Client;

    static async init(): Promise<void> {
        this._client = new tmi.Client({
            connection: {
                reconnect: true
            },
            channels: Config.TWITCH_JOIN_CHANNELS,
            identity: {
                username: Config.TWITCH_BOT_USERNAME,
                password: Config.TWITCH_BOT_TOKEN
            }
        });

        this._client.on("message", handleTwitchMessage);
        await this._client.connect();
    }

    static instance(): tmi.Client {
        return this._client;
    }
}

async function handleTwitchMessage(channel: string, context: tmi.ChatUserstate, message: string): Promise<void> {
    // Ignore messages without a username
    if (!context.username) {
        Logger.debug(undefined, "Received a message without a username", { channel, context, message });
        return;
    }

    // Don't respond to the bot's own messages
    const isSelf = context.username.toLowerCase() === Config.TWITCH_BOT_USERNAME.toLowerCase();
    if (isSelf) {
        Logger.debug(undefined, "Received a message from the bot itself");
        return;
    }

    // Only allow the bot admin to use the bot
    if (context.username !== Config.TWITCH_BOT_ADMIN) {
        Logger.debug(undefined, "Received a message from a non-admin user", { channel, context, message });
        return;
    }

    // Check if they @'d the bot in their message
    if (!message.toLowerCase().includes(Config.TWITCH_BOT_USERNAME.toLowerCase())) {
        Logger.debug(undefined, "Received a message without the bot's username", { channel, context, message });
        return;
    }

    // Remove the bot's username from the beginning of the message if it's there (with or without an @)
    const cleaned = message.replace(new RegExp(`^@?${Config.TWITCH_BOT_USERNAME}`, "i"), Config.HENNOS_BOT_NAME).trim();

    const user = await HennosUser.async(-1, context.username, context.username);
    const group = await HennosGroup.async(-1, `${channel}`);

    const response = await handleOneOffGroupMessage(user, group, cleaned, {
        content: `This user is sending their message from Twitch.tv chat on channel '${channel}'. Keep your response very short. Only a couple sentences at most.`,
        role: "system",
        type: "text"
    });

    if (response.__type === "string") {
        const bot = TwitchBotInstance.instance();

        // Twitch only allows 500 characters per message
        const chunks = response.payload.match(/.{1,500}(\s|$)|\S+?(\s|$)/g) || [];
        for (const chunk of chunks) {
            await bot.say(channel, chunk);
        }
    }
    return;
}
