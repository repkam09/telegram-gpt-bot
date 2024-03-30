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
import { HennosUser } from "../singletons/user";

export async function isSupportedDocumentType(mime_type: string): Promise<boolean> {
    if (mime_type === "text/plain") {
        return true;
    }

    return false;
}

export async function handleDocumentMessage(user: HennosUser, path: string, mime_type: string, uuid: string): Promise<string> {
    switch(mime_type) {
    case "text/plain":
        return handlePlainTextDocument(user, path, uuid);
    default:
        return `This document seems to be a ${mime_type} which is not yet supported.`;
    }
}


export async function handlePlainTextDocument(user: HennosUser, path: string, uuid: string): Promise<string> {
    Logger.info(user, `Processing document at path: ${path} with UUID: ${uuid}.`);
    
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