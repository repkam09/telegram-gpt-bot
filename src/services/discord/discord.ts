import { ChannelType, Client, Events, GatewayIntentBits, Partials, TextChannel, VoiceChannel, VoiceState } from "discord.js";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { handleOneOffPrivateMessage, handlePrivateMessage } from "../../handlers/text/private";
import { handleGroupMessage } from "../../handlers/text/group";
import { HennosUser } from "../../singletons/user";
import { HennosGroup } from "../../singletons/group";
import { HennosConsumer } from "../../singletons/base";
import { HennosResponse } from "../../types";
import { AudioPlayer, AudioReceiveStream, createAudioPlayer, createAudioResource, EndBehaviorType, getVoiceConnection, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import opus, { OpusEncoder } from "@discordjs/opus";
import wav, { Writer } from "wav";
import { PassThrough, Readable, Transform, TransformCallback, TransformOptions } from "node:stream";
import { HennosOpenAISingleton } from "../../singletons/openai";

export type ChannelCommonType = TextChannel | VoiceChannel | null;

export const BOT_NAME = "Hennos";

let voiceChannelConnection: VoiceConnection | undefined;
let player: AudioPlayer | null = null;
let clientSingleton: Client;
let hennosConsumer: HennosUser;

export class DiscordBotInstance {
    static _hasCompletedInit = false;

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
                        DiscordBotInstance._hasCompletedInit = true;
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
                                    const response = await handleGroupMessage(user, group, message.content);
                                    await handleHennosResponse(response, message.channel);
                                } catch (err: unknown) {
                                    const error = err as Error;
                                    Logger.error(user, `Error handling Discord group message from ${message.author.tag} (${message.author.id}): ${error.message}`);
                                }
                            }
                        });

                        client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
                            let currentChannelId = null;
                            try {
                                currentChannelId = newState.channelId ? newState.channelId : oldState.channelId;
                                const invalidChannel = await checkIfInvalidVoiceChannel(oldState, newState);
                                if (invalidChannel || invalidChannel === null) return;
                                voiceChannelConnection = getConnection(newState.guild.id);
                                if (!voiceChannelConnection) {
                                    voiceChannelConnection = joinVoiceChannelAndGetConnection(newState);
                                    addVoiceConnectionReadyEvent(voiceChannelConnection, currentChannelId!);
                                }
                            } catch (error) {
                                console.error(`Error in VoiceStateUpdate event in channel: ${currentChannelId}`, error);
                            }
                        });

                        clientSingleton = readyClient;
                        const setUser = async () => {
                            hennosConsumer = await HennosUser.async(Config.DISCORD_BOT_ADMIN, "Mark");
                        };

                        setUser();

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

export const addVoiceConnectionReadyEvent = (connection: VoiceConnection, channelId: string): void => {
    connection.on(VoiceConnectionStatus.Ready, () => {
        Logger.debug(hennosConsumer, "Bot is connected and ready to answer users questions!");
        addSpeakingEvents(connection, channelId);
    });
};


const addSpeakingEvents = (connection: VoiceConnection, channelId: string): void => {
    const receiver = connection.receiver;
    receiver.speaking.on("start", async (userId: string) => {
        Logger.debug(hennosConsumer, `User ${userId} started speaking, waiting for finish...`);
        receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000,
            },
        });
    });

    receiver.speaking.on("end", async (userId: string) => {
        try {
            const userOpusStream = receiver.subscriptions.get(userId);
            if (!userOpusStream) return;
            Logger.debug(hennosConsumer, `User ${userId} finished speaking, creating an answer...`);
            const voiceAudioBuffer = await createWavAudioBufferFromOpus(userOpusStream, channelId);
            await playOpenAiAnswerWithSpeech(voiceAudioBuffer, connection, channelId);
        } catch (error) {
            Logger.error(hennosConsumer, "Error playing answer on voice channel: ", error);
            await sendMessageToProperChannel("**There was problem with the answer**", channelId);
        }
    });
};


export const joinVoiceChannelAndGetConnection = (newState: VoiceState): VoiceConnection => {
    const connection = joinVoiceChannel({
        channelId: newState.channelId!,
        guildId: newState.guild.id,
        adapterCreator: newState.guild.voiceAdapterCreator,
        selfMute: true,
        selfDeaf: false,
    });
    return connection;
};

export const sendMessageToProperChannel = async (message: string, channelId: string, tts = false, maxLength = 2000): Promise<ChannelCommonType> => {
    const channel = await getCurrentChannel(channelId);
    if (channel === null) return null;
    if (message.length <= maxLength) {
        await channel.send({ content: message, tts: tts });
        return channel;
    }
    const messageParts: string[] = [];
    let currentIndex = 0;
    while (currentIndex < message.length) {
        const part = message.slice(currentIndex, currentIndex + maxLength);
        messageParts.push(part);
        currentIndex += maxLength;
    }
    for (const part of messageParts) {
        await channel.send({ content: part, tts: tts });
    }
    return channel;
};


export const checkIfInvalidVoiceChannel = async (oldState: VoiceState, newState: VoiceState): Promise<boolean> => {
    if (newState === null || newState.member === null) return true;
    if (newState.member.user.bot) return true;
    if (newState.channel && newState.channel.type === ChannelType.GuildVoice) return false;
    if (oldState.channelId && !newState.channelId) {
        // User has left voice channel
        await destroyConnectionIfOnlyBotRemains(getConnection(oldState.guild.id), oldState.channelId);
        return true;
    }

    return true;
};

const destroyConnectionIfOnlyBotRemains = async (connection: VoiceConnection | undefined, channelId: string): Promise<void> => {
    if (!connection) return;
    const channel = await getCurrentChannel(channelId);
    if (channel === null) return;
    const member = isUserChannelMember(BOT_NAME, channel);
    if (member && channel.members.size === 1) {
        Logger.debug(hennosConsumer, "Destroying current voice connection and it's listeners!");
        connection.removeAllListeners();
        connection.destroy();
    }
};

const isUserChannelMember = (name: string, channel: TextChannel | VoiceChannel): boolean =>
    channel.members.some((member) => member.displayName === name);

export const getCurrentChannel = async (channelId: string): Promise<ChannelCommonType> => {
    if (!channelId) return null;
    const channel = await clientSingleton.channels.fetch(channelId);
    if (channel instanceof TextChannel || channel instanceof VoiceChannel) {
        return channel;
    }
    return null;
};

export const createWavAudioBufferFromOpus = async (opusStream: AudioReceiveStream, channelId: string): Promise<Buffer> => {
    const opusEncoder = new opus.OpusEncoder(48000, 2);
    const wavEncoder = new wav.Writer({
        channels: 2,
        sampleRate: 48000,
        bitDepth: 16,
    });
    try {
        return await convertOpusStreamToWavBuffer(opusStream, opusEncoder, wavEncoder);
    } catch (error) {
        console.error(`Error converting to .flac audio stream for channel: ${channelId}: `, error);
        throw error;
    }
};

const initAndSubscribeAudioPlayerToVoiceChannel = async (connection: VoiceConnection): Promise<void> => {
    if (player === null) {
        player = createAudioPlayer();
        addOnErrorPlayerEvent();
    }
    connection.subscribe(player!);
};

const addOnErrorPlayerEvent = (): void => {
    player!.on("error", (error: any) => {
        console.error("Error:", error.message, "with audio", error.resource.metadata.title);
    });
};


export const playOpenAiAnswerWithSpeech = async (audioBuffer: Buffer, connection: VoiceConnection, channelId: string) => {
    await initAndSubscribeAudioPlayerToVoiceChannel(connection);
    const transcript = await HennosOpenAISingleton.instance().transcription(hennosConsumer, audioBuffer);
    if (transcript.__type !== "string") {
        throw new Error("Error transcribing audio to text");
    }

    const result = await handleOneOffPrivateMessage(hennosConsumer, transcript.payload, {
        content: "This message was sent via a Discord voice channel, transcribed to text for your convenience. Your response will be sent back to the user as speech. Avoid using special characters, emojis, or anything else that cannot easily be spoken.",
        role: "system",
        type: "text"
    });
    if (result.__type !== "string") {
        throw new Error("Error generating answer from OpenAI");
    }

    await playSpeechAudioFromText(result.payload);
};

const playSpeechAudioFromText = async (text: string | null): Promise<void> => {
    if (text !== null) {
        const audio = await generateSpeechFromText(text);
        player!.play(createAudioResource(audio));
    }
};

export const generateSpeechFromText = async (text: string): Promise<Readable> => {
    Logger.debug(hennosConsumer, `Generating speech audio from text: ${text}`);
    const result = await HennosOpenAISingleton.instance().speech(hennosConsumer, text);
    if (result.__type !== "arraybuffer") {
        throw new Error("Error generating speech audio from text");
    }
    const buffer = Buffer.from(result.payload);
    return Readable.from(buffer);
};

export const convertOpusStreamToWavBuffer = async (opusStream: AudioReceiveStream, opusEncoder: OpusEncoder, wavEncoder: Writer): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const finalAudioDataStream = new PassThrough();
        const opusStreamDecoder = new OpusDecodingStream({}, opusEncoder);
        opusStream
            .pipe(opusStreamDecoder)
            .pipe(wavEncoder)
            .pipe(finalAudioDataStream);

        const audioDataChunks: Buffer[] = [];
        finalAudioDataStream
            .on("data", (chunk) => audioDataChunks.push(chunk))
            .on("error", (err) => reject(err))
            .on("end", () => resolve(Buffer.concat(audioDataChunks)));
    });
};

export const getConnection = (guildId: string): VoiceConnection | undefined => getVoiceConnection(guildId);

export class OpusDecodingStream extends Transform {
    private _encoder: OpusEncoder;

    constructor(options: TransformOptions, encoder: OpusEncoder) {
        super(options);
        this._encoder = encoder;
    }

    _transform(data: Buffer, encoding: any, callback: TransformCallback) {
        this.push(this._encoder.decode(data));
        callback();
    }
}
