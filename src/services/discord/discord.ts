import { ChannelType, Client, Events, GatewayIntentBits, Partials, TextChannel, VoiceChannel, VoiceState } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handlePrivateMessage } from "../../handlers/text/private";
import { handleGroupMessage } from "../../handlers/text/group";
import { HennosUser } from "../../singletons/user";
import { HennosGroup } from "../../singletons/group";
import { HennosConsumer } from "../../singletons/base";
import { HennosResponse } from "../../types";
import { AudioPlayer, AudioPlayerError, AudioReceiveStream, createAudioPlayer, createAudioResource, EndBehaviorType, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import opus, { OpusEncoder } from "@discordjs/opus";
import wav from "wav";
import { PassThrough, Readable, Transform, TransformCallback, TransformOptions } from "node:stream";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { HennosOllamaSingleton } from "../../singletons/ollama";

type ChannelCommonType = TextChannel | VoiceChannel | null;

const triggerPhrases = [
    `${Config.DISCORD_DISPLAY_NAME}`,
    "Henos",
    "Hennos",
    "Enos",
    "Hennas",
    "Hello,",
    "Heados,"
];

export class DiscordBotInstance {
    static _hasCompletedInit = false;
    static _readyClient: Client;

    static async init(): Promise<void> {
        return new Promise((resolve) => {
            // This init process is a bit weird, it doesnt always seem to work, so potentially try a few times...
            const interval = setInterval(() => {
                if (!DiscordBotInstance._hasCompletedInit) {
                    Logger.debug(undefined, "Initializing Discord bot instance...");
                    const client = new Client({
                        intents: [
                            GatewayIntentBits.Guilds,
                            GatewayIntentBits.GuildMessages,
                            GatewayIntentBits.MessageContent,
                            GatewayIntentBits.DirectMessages,
                            GatewayIntentBits.DirectMessageReactions,
                            GatewayIntentBits.GuildVoiceStates
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
                            Logger.debug(undefined, "Discord Client has already completed initialization.");
                            return;
                        }
                        DiscordBotInstance._readyClient = readyClient;
                        DiscordBotInstance._hasCompletedInit = true;
                        DiscordBotInstance.register();
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

    static async getCurrentChannel(channelId: string): Promise<ChannelCommonType> {
        if (!channelId) {
            return null;
        }

        const channel = await DiscordBotInstance._readyClient.channels.fetch(channelId);
        if (channel instanceof TextChannel || channel instanceof VoiceChannel) {
            return channel;
        }

        return null;
    }

    static register(): void {
        const readyClient = DiscordBotInstance._readyClient;

        readyClient.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
            const currentChannelId = newState.channelId ? newState.channelId : oldState.channelId;
            if (!currentChannelId) return;

            Logger.debug(undefined, `VoiceStateUpdate event in channel: ${currentChannelId}`);

            const checkIfInvalidVoiceChannel = async (oldState: VoiceState, newState: VoiceState): Promise<boolean> => {
                if (newState === null || newState.member === null) return true;
                if (newState.member.user.bot) return true;
                if (newState.channel && newState.channel.type === ChannelType.GuildVoice) return false;
                if (oldState.channelId && !newState.channelId) {
                    const connection = getVoiceConnection(oldState.guild.id);
                    if (!connection) return true;

                    const channel = await DiscordBotInstance.getCurrentChannel(oldState.channelId);
                    if (channel === null) return true;

                    const member = channel.members.some((member) => member.displayName === Config.DISCORD_DISPLAY_NAME);
                    if (member && channel.members.size === 1) {
                        Logger.debug(undefined, "Destroying current voice connection and it's listeners!");
                        connection.removeAllListeners();
                        connection.destroy();
                    }
                    return true;
                }
                return true;
            };

            try {
                const invalidChannel = await checkIfInvalidVoiceChannel(oldState, newState);
                if (invalidChannel) return;

                Logger.debug(undefined, `Looking for voice connection for channel: ${currentChannelId}`);
                const initVoiceChannelConnection = getVoiceConnection(newState.guild.id);
                if (!initVoiceChannelConnection) {
                    Logger.debug(undefined, "Creating voice connection...");
                    const group = await HennosGroup.async(Number(currentChannelId), undefined);
                    const connection = joinVoiceChannel({
                        channelId: currentChannelId,
                        guildId: newState.guild.id,
                        adapterCreator: newState.guild.voiceAdapterCreator,
                        selfMute: true,
                        selfDeaf: false,
                    });

                    let audioPlayer: AudioPlayer;
                    connection.on(VoiceConnectionStatus.Ready, () => {
                        if (!audioPlayer) {
                            audioPlayer = createAudioPlayer();
                            audioPlayer.on("error", (error: AudioPlayerError) => {
                                console.error("Error:", error.message, "with audio", error.resource.metadata);
                            });
                        }

                        connection.receiver.speaking.on("start", async (userId: string) => {
                            const user = await HennosUser.async(Number(userId), userId, undefined, undefined);
                            Logger.debug(user, `User ${userId} started speaking, waiting for finish...`);
                            connection.receiver.subscribe(userId, {
                                end: {
                                    behavior: EndBehaviorType.AfterSilence,
                                    duration: 2000,
                                },
                            });
                        });

                        connection.receiver.speaking.on("end", async (userId: string) => {
                            const user = await HennosUser.async(Number(userId), userId, undefined, undefined);
                            try {
                                const userOpusStream = connection.receiver.subscriptions.get(userId);
                                if (!userOpusStream) return;
                                Logger.debug(user, `User ${userId} finished speaking, creating an answer...`);
                                const voiceAudioBuffer = await DiscordBotInstance.convertOpusStreamToWavBuffer(userOpusStream);

                                connection.subscribe(audioPlayer);
                                const transcript = await HennosOllamaSingleton.instance().transcription(user, voiceAudioBuffer);
                                if (transcript.__type === "empty") {
                                    Logger.debug(user, "Empty transcription result, ignoring...");
                                    return;
                                }

                                if (transcript.__type === "arraybuffer") {
                                    Logger.debug(user, "This should not happen, ignoring...");
                                    return;
                                }

                                if (transcript.__type === "error") {
                                    Logger.error(user, `Error transcribing voice audio: ${transcript.payload}`);
                                    return;
                                }

                                if (!triggerPhrases.map((entry) => entry.toLowerCase()).some((phrase) => transcript.payload.toLowerCase().includes(phrase))) {
                                    Logger.trace(user, "discord_voice_context");
                                    await group.updateChatContext("user", transcript.payload);
                                    return;
                                }

                                Logger.trace(user, "discord_voice");
                                const result = await handleGroupMessage(user, group, transcript.payload, {
                                    content: "This message was sent via a Discord voice channel, transcribed to text for your convenience. Your response will be sent back to the user as speech. Avoid using special characters, emojis, or anything else that cannot easily be spoken.",
                                    role: "system",
                                    type: "text"
                                });

                                if (result.__type !== "string") {
                                    throw new Error("Error generating answer from OpenAI");
                                }

                                if (result.payload !== null) {
                                    Logger.debug(user, `Generating speech audio from text: ${result.payload}`);
                                    const speech = await HennosOpenAISingleton.instance().speech(user, result.payload);
                                    if (speech.__type !== "arraybuffer") {
                                        throw new Error("Error generating speech audio from text");
                                    }
                                    const buffer = Buffer.from(speech.payload);

                                    const audio = Readable.from(buffer);
                                    const audioResources = createAudioResource(audio);
                                    audioPlayer.play(audioResources);
                                }
                            } catch (error) {
                                Logger.error(user, "Error playing answer on voice channel: ", error);
                            }
                        });
                    });
                }
            } catch (error) {
                console.error(`Error in VoiceStateUpdate event in channel: ${currentChannelId}`, error);
            }
        });

        readyClient.on(Events.MessageCreate, async message => {
            // Ignore messages from bots (this includes ourself because discord is weird)
            if (message.author.bot) return;

            // Right now only let the admin send messages to the bot
            if (Number(message.author.id) !== Config.DISCORD_BOT_ADMIN) {
                Logger.debug(undefined, `Ignoring discord message from non-admin user ${message.author.tag} (${message.author.id})`);
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
                    Logger.trace(user, "discord_message_dm");
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
                    Logger.trace(user, "discord_message_group");
                    const response = await handleGroupMessage(user, group, message.content);
                    await handleHennosResponse(response, message.channel);
                } catch (err: unknown) {
                    const error = err as Error;
                    Logger.error(user, `Error handling Discord group message from ${message.author.tag} (${message.author.id}): ${error.message}`);
                }
            }
        });
    }

    static convertOpusStreamToWavBuffer(opusStream: AudioReceiveStream): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const _opusEncoder = new opus.OpusEncoder(16000, 2);
            const _wavEncoder = new wav.Writer({
                channels: 2,
                sampleRate: 16000,
                bitDepth: 16,
            });

            const finalAudioDataStream = new PassThrough();
            const opusStreamDecoder = new OpusDecodingStream({}, _opusEncoder);
            opusStream
                .pipe(opusStreamDecoder)
                .pipe(_wavEncoder)
                .pipe(finalAudioDataStream);

            const audioDataChunks: Buffer[] = [];
            finalAudioDataStream
                .on("data", (chunk) => audioDataChunks.push(chunk))
                .on("error", (err) => reject(err))
                .on("end", () => resolve(Buffer.concat(audioDataChunks)));
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


class OpusDecodingStream extends Transform {
    private _encoder: OpusEncoder;

    constructor(options: TransformOptions, encoder: OpusEncoder) {
        super(options);
        this._encoder = encoder;
    }

    _transform(data: Buffer, _encoding: unknown, callback: TransformCallback) {
        this.push(this._encoder.decode(data));
        return callback();
    }
}
