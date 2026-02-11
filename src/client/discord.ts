import fs from "fs/promises";
import path from "path";

import { Client, DMChannel, Events, GatewayIntentBits, Message, OmitPartialGroupDMChannel, Partials } from "discord.js";
import { AgentResponseHandler, createWorkflowId, signalAgenticWorkflowExternalContext, signalAgenticWorkflowMessage } from "../temporal/agent/interface";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { handleDocument } from "../tools/FetchWebpageContent";
import { FILE_EXT_TO_READER } from "@llamaindex/readers/directory";

export class DiscordInstance {
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
            Logger.info(undefined, `Logged in as ${readyClient.user.tag}!`);

            // Setting up workflow callback handler
            AgentResponseHandler.registerListener("discord", async (message: string, chatId: string) => {
                Logger.info(
                    undefined,
                    `Received workflow callback for Discord in channel ${chatId}`
                );

                const channel = await readyClient.channels.fetch(chatId);
                if (channel && channel.isTextBased()) {
                    const textChannel = channel as DMChannel;

                    // If the Response is longer than 3500 characters, split it into multiple messages
                    if (message.length > 3500) {
                        const parts = message.match(/.{1,3500}/g);
                        if (parts) {
                            for (const part of parts) {
                                await textChannel.send(part);
                            }
                        }
                    } else {
                        await textChannel.send(message);
                    }
                } else {
                    Logger.error(`Channel with ID ${chatId} not found or is not text-based`);
                }
            });

            AgentResponseHandler.registerArtifactListener("discord", async (filePath: string, chatId: string, description?: string | undefined) => {
                try {
                    const channel = await readyClient.channels.fetch(chatId);
                    if (channel && channel.isTextBased()) {
                        const textChannel = channel as DMChannel;

                        await textChannel.send({
                            content: description,
                            files: [filePath]
                        });
                    } else {
                        Logger.error(`Channel with ID ${chatId} not found or is not text-based`);
                    }
                } catch (err: unknown) {
                    const error = err as Error;
                    Logger.error("discord", `Error sending document to chatId ${chatId}: ${error.message}`, error);
                }
            });

        });

        client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            Logger.info(undefined, `Received command: ${interaction.commandName}`);
        });

        client.on(Events.MessageCreate, async message => {
            if (message.author.bot) return; // Ignore messages from bots

            const { author, workflowId } = DiscordInstance.workflowSignalArguments(message);

            if (message.attachments && message.attachments.size > 0) {
                for (const attachment of message.attachments.values()) {
                    Logger.info(workflowId, `Received attachment: ${attachment.url}`);
                    try {
                        const result = await DiscordInstance.downloadDiscordFile(workflowId, attachment.url, attachment.id, Config.LOCAL_STORAGE(workflowId));
                        if (!result) {
                            Logger.error(workflowId, `Failed to download document with file_id: ${attachment.id}`);
                            continue;
                        }

                        const ext = path.extname(attachment.name) ? path.extname(attachment.name).substring(1) : ".bin";
                        const reader = FILE_EXT_TO_READER[ext];
                        if (!reader) {
                            Logger.warn(workflowId, `No reader available for document with file_id: ${attachment.id} and extension: ${ext}`);
                            const payload = `<document><file_id>${attachment.id}</file_id><file_name>${attachment.name || ""}</file_name><mime_type>${attachment.contentType || ""}</mime_type><file_size>${attachment.size || ""}</file_size><error>No reader available for document with file_id: ${attachment.id} and extension: ${ext}</error></document>`;
                            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
                        }

                        if (reader) {
                            const summary = await handleDocument(workflowId, result, attachment.id, reader);
                            const payload = `<document><file_id>${attachment.id}</file_id><file_name>${attachment.name || ""}</file_name><mime_type>${attachment.contentType || ""}</mime_type><file_size>${attachment.size || ""}</file_size><summary>${summary}</summary></document>`;
                            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
                        }

                    } catch (err: unknown) {
                        const error = err as Error;
                        Logger.error(workflowId, `Error fetching attachment from Discord: ${error.message}`, error);
                    }
                }
            }

            if (message.content && message.content.trim() !== "") {
                return signalAgenticWorkflowMessage(workflowId, author, message.content);
            }
        });
        await client.login(Config.DISCORD_BOT_TOKEN);
    }

    private static workflowSignalArguments(msg: OmitPartialGroupDMChannel<Message<boolean>>): { author: string; workflowId: string; } {
        return {
            author: msg.author.globalName || msg.author.username,
            workflowId: createWorkflowId("discord", String(msg.channelId)),
        };
    }

    private static async downloadDiscordFile(workflowId: string, url: string, file_id: string, downloadPath: string): Promise<string | null> {
        try {

            const response = await fetch(url);
            if (!response.ok) {
                Logger.error(workflowId, `Failed to download file from Discord. Status: ${response.status} ${response.statusText}`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const filePath = path.join(downloadPath, file_id);
            await fs.writeFile(filePath, buffer);

            return filePath;
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `Error downloading file from Telegram: ${error.message}`, error);
        }
        return null;
    }
}