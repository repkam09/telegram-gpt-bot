import tmi from "tmi.js";
import { Config } from "../../singletons/config";
import { HennosUser } from "../../singletons/user";
import { handlePrivateMessage } from "../../handlers/text/private";
import { Logger } from "../../singletons/logger";

export class TwitchBotInstance {
    static async init(): Promise<void> {
        const client = new tmi.Client({
            connection: {
                reconnect: true
            },
            channels: Config.TWITCH_JOIN_CHANNELS,
            identity: {
                username: Config.TWITCH_BOT_USERNAME,
                password: Config.TWITCH_BOT_TOKEN
            }
        });

        client.on("message", async (channel, context, message) => {
            if (!context.username) {
                return;
            }

            const isSelf = context.username.toLowerCase() === Config.TWITCH_BOT_USERNAME.toLowerCase();
            if (isSelf) {
                Logger.debug("TwitchBotInstance", "Ignoring message from self");
                return;
            }

            const user = await HennosUser.async(-1, context.username, context.username);
            const response = await handlePrivateMessage(user, message, {
                content: `This user is sending their message from Twitch.tv chat on channel ${channel}.`,
                role: "system"
            });
            if (response.__type === "string") {
                return client.say(channel, response.payload);
            }
        });

        await client.connect();
    }
}
