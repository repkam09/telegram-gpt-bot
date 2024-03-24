import { Logger } from "../singletons/logger";
import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { isOnBlacklist, isOnWhitelist, sendAdminMessage, sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage } from "./text/common";
import fs from "node:fs/promises";
import os from "os";
import {
    Document,
    SimpleNodeParser,
    SummaryIndex,
    SummaryRetrieverMode,
    serviceContextFromDefaults,
    Ollama,
    OllamaEmbedding,
    ResponseSynthesizer,
    MetadataMode,
    SentenceSplitter,
    SimpleDirectoryReader
} from "llamaindex";

export function listen() {
    BotInstance.instance().on("document", handleDocument);
}

async function handleDocument(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private" || !msg.from || !msg.document) {
        return;
    }

    if (isOnBlacklist(chatId)) {
        Logger.trace("blacklist", msg);
        return;
    }

    Logger.trace("document", msg);

    const { first_name, last_name, username, id } = msg.from;
    await ChatMemory.upsertUserInfo(id, first_name, last_name, username);


    if (!isOnWhitelist(id)) {
        await sendMessageWrapper(id, NotWhitelistedMessage);
        await sendAdminMessage(`${first_name} ${last_name} [${username}] [${id}] sent a message but is not whitelisted`);
        return;
    }

    const mime_type = msg.document.mime_type;
    await sendMessageWrapper(chatId, `Processing Document: ${msg.document.file_name} (${msg.document.file_size} bytes)`);
    const path = await BotInstance.instance().downloadFile(msg.document.file_id, os.tmpdir());
    switch (mime_type) {
    case "text/plain": {
        const response = await handlePlainTextDocument(chatId, path, msg.document!);
        return sendMessageWrapper(chatId, response);
    }
    default: {
        return sendMessageWrapper(chatId, `This document seems to be a ${mime_type} which is not yet supported.`);
    }
    }
}

export async function handlePlainTextDocument(chatId: number, path: string, tg: TelegramBot.Document): Promise<string> {
    const dir = new SimpleDirectoryReader();
    const documents = await dir.loadData({
        directoryPath: path
    });

    const serviceContext = serviceContextFromDefaults({
        llm: new Ollama({
            model: "mistral:text",
            requestTimeout: 600000,
            contextWindow: 4096
        }),
        embedModel: new OllamaEmbedding({
            contextWindow: 4096,
            model: "nomic-embed-text:latest",
            requestTimeout: 600000
        }),
        nodeParser: new SimpleNodeParser({
            chunkSize: 512,
            chunkOverlap: 128
        })
    });

    const index = await SummaryIndex.fromDocuments(documents, {
        serviceContext
    });

    const queryEngine = index.asQueryEngine({
        responseSynthesizer: new ResponseSynthesizer({
            metadataMode: MetadataMode.ALL,
            serviceContext
        }),
        retriever: index.asRetriever({
            mode: SummaryRetrieverMode.DEFAULT,
        })
    });

    const response = await queryEngine.query({
        query: "What was included in the appliance order?"
    });

    return response.toString();
}