import fs from "fs/promises";
import path from "path";

import { Client, GatewayDispatchEvents, GatewayMessageCreateDispatchData, ToEventProps } from "@discordjs/core";
import { REST } from "@discordjs/rest";
import { WebSocketManager } from "@discordjs/ws";
import { createWorkflowId, signalAgenticWorkflowExternalContext, signalAgenticWorkflowMessage } from "../temporal/agent/interface";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { handleDocument } from "../tools/FetchWebpageContent";
import { FILE_EXT_TO_READER } from "@llamaindex/readers/directory";
import { AgentResponseHandler } from "../response";

export class FluxerInstance {
    static async init() {
        const rest = new REST({ api: "https://api.fluxer.app", version: "1" }).setToken(Config.FLUXER_BOT_TOKEN);

        const gateway = new WebSocketManager({
            intents: 0,
            rest,
            token: Config.FLUXER_BOT_TOKEN,
            version: "1",
        });

        const client = new Client({ rest, gateway });

        client.on(GatewayDispatchEvents.MessageCreate, async (message) => {
            if (message.data.author.bot) return; // Ignore messages from bots

            const { author, workflowId } = await FluxerInstance.workflowSignalArguments(message);

            if (message.data.attachments && message.data.attachments.length > 0) {
                for (const attachment of message.data.attachments) {
                    Logger.info(workflowId, `Received attachment: ${attachment.url}`);
                    try {
                        const result = await FluxerInstance.downloadFluxerFile(workflowId, attachment.url, attachment.id, Config.LOCAL_STORAGE(workflowId));
                        if (!result) {
                            Logger.error(workflowId, `Failed to download document with file_id: ${attachment.id}`);
                            continue;
                        }

                        const ext = path.extname(attachment.filename) ? path.extname(attachment.filename).substring(1) : ".bin";
                        const reader = FILE_EXT_TO_READER[ext];
                        if (!reader) {
                            Logger.warn(workflowId, `No reader available for document with file_id: ${attachment.id} and extension: ${ext}`);
                            const payload = `<document><file_id>${attachment.id}</file_id><file_name>${attachment.filename || ""}</file_name><mime_type>${attachment.content_type || ""}</mime_type><file_size>${attachment.size || ""}</file_size><error>No reader available for document with file_id: ${attachment.id} and extension: ${ext}</error></document>`;
                            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
                        }

                        if (reader) {
                            const summary = await handleDocument(workflowId, result, attachment.id, reader);
                            const payload = `<document><file_id>${attachment.id}</file_id><file_name>${attachment.filename || ""}</file_name><mime_type>${attachment.content_type || ""}</mime_type><file_size>${attachment.size || ""}</file_size><summary>${summary}</summary></document>`;
                            await signalAgenticWorkflowExternalContext(workflowId, author, payload);
                        }

                    } catch (err: unknown) {
                        const error = err as Error;
                        Logger.error(workflowId, `Error fetching attachment from Fluxer: ${error.message}`, error);
                    }
                }
            }

            if (message.data.content && message.data.content.trim() !== "") {
                return signalAgenticWorkflowMessage(workflowId, author, message.data.content);
            }
        });

        client.on(GatewayDispatchEvents.Ready, (readyClient) => {
            const { username, discriminator } = readyClient.data.user;
            Logger.info(undefined, `Logged in as @${username}#${discriminator}`);

            // Setting up workflow callback handler
            AgentResponseHandler.registerMessageListener("fluxer", async (message: string, chatId: string) => {
                Logger.info(
                    "fluxer",
                    `Received workflow callback for Fluxer in channel ${chatId}`
                );

                // If the Response is longer than 3500 characters, split it into multiple messages
                if (message.length > 3500) {
                    const parts = message.match(/.{1,3500}/g);
                    if (parts) {
                        for (const part of parts) {
                            await readyClient.api.channels.createMessage(chatId, {
                                content: part
                            });
                        }
                    }
                } else {
                    await readyClient.api.channels.createMessage(chatId, {
                        content: message
                    });
                }
            });

            AgentResponseHandler.registerStatusListener("fluxer", async (event: { type: string; payload?: unknown }, chatId: string) => {
                Logger.info("fluxer", `Received status update: ${JSON.stringify(event)} for chatId: ${chatId}`);
                // TODO: Handle sending status updates if needed
            });

            AgentResponseHandler.registerArtifactListener("fluxer", async (filePath: string, chatId: string, mime_type: string, description?: string | undefined) => {
                Logger.info("fluxer", `Received artifact: ${filePath} for chatId: ${chatId} with mime_type: ${mime_type} and description: ${description}`);
                // TODO: Handle sending artifacts if needed
            });
        });

        await gateway.connect();
    }

    private static async workflowSignalArguments(msg: ToEventProps<GatewayMessageCreateDispatchData>): Promise<{ author: string; workflowId: string; }> {
        return {
            author: msg.data.author.global_name || msg.data.author.username,
            workflowId: await createWorkflowId("fluxer", String(msg.data.channel_id)),
        };
    }

    private static async downloadFluxerFile(workflowId: string, url: string, file_id: string, downloadPath: string): Promise<string | null> {
        try {

            const response = await fetch(url);
            if (!response.ok) {
                Logger.error(workflowId, `Failed to download file from Fluxer. Status: ${response.status} ${response.statusText}`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const filePath = path.join(downloadPath, file_id);
            await fs.writeFile(filePath, buffer);

            return filePath;
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `Error downloading file from Fluxer: ${error.message}`, error);
        }
        return null;
    }
}