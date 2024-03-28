import { ChatMemory } from "../singletons/memory";
import { BotInstance } from "../singletons/telegram";
import { sendMessageWrapper } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { NotWhitelistedMessage } from "./text/common";
import {
    SimpleNodeParser,
    SummaryIndex,
    SummaryRetrieverMode,
    serviceContextFromDefaults,
    Ollama,
    OllamaEmbedding,
    ResponseSynthesizer,
    MetadataMode,
    SimpleDirectoryReader
} from "llamaindex";
import { Logger } from "../singletons/logger";

export function listen() {
    BotInstance.instance().on("document", handleDocument);
}

async function handleDocument(msg: TelegramBot.Message) {
    if (msg.chat.type !== "private" || !msg.from || !msg.document) {
        return;
    }

    const user = await ChatMemory.upsertUserInfo(msg.from);
    if (!user.whitelisted) {
        return sendMessageWrapper(user.chatId, NotWhitelistedMessage);
    }

    return sendMessageWrapper(user.chatId, `This document seems to be a ${msg.document.mime_type} which is not yet supported.`);
}

export async function handlePlainTextDocument(chatId: number, path: string, tg: TelegramBot.Document): Promise<string> {
    Logger.info(`Processing document ${tg.file_name} for chat ${chatId}`);
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