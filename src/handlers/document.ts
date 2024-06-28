import {
    SimpleNodeParser,
    SummaryIndex,
    SummaryRetrieverMode,
    serviceContextFromDefaults,
    Ollama,
    OllamaEmbedding,
    ResponseSynthesizer,
    MetadataMode,
    TextFileReader
} from "llamaindex";
import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";

export async function isSupportedDocumentType(mime_type: string): Promise<boolean> {
    if (mime_type === "text/plain") {
        return true;
    }

    return false;
}

export async function handleDocumentMessage(user: HennosUser, path: string, mime_type: string, uuid: string): Promise<string> {
    try {
        switch (mime_type) {
            case "text/plain":
                return handlePlainTextDocument(user, path, uuid);
            default:
                return `This document seems to be a ${mime_type} which is not yet supported.`;
        }
    } catch (err) {
        Logger.error(user, `Error while processing document at path ${path} with UUID ${uuid}.`, err);
        return "An error occured while processing your document.";
    }
}


export async function handlePlainTextDocument(user: HennosUser, path: string, uuid: string): Promise<string> {
    Logger.info(user, `Processing document at path: ${path} with UUID: ${uuid}.`);

    const tfr = new TextFileReader();
    const documents = await tfr.loadData(path);

    const serviceContext = serviceContextFromDefaults({
        llm: new Ollama({
            model: Config.OLLAMA_LLM_LARGE.MODEL,
            requestTimeout: 600000,
            contextWindow: Config.OLLAMA_LLM_LARGE.CTX
        }),
        embedModel: new OllamaEmbedding({
            contextWindow: Config.OLLAMA_LLM_EMBED.CTX,
            model: Config.OLLAMA_LLM_EMBED.MODEL,
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
        query: "Can you provide a summary of this document?"
    });

    const summary = response.toString();

    await user.updateChatContext("user", "I uploaded a document for you to summarize. Its a plan text file.");
    await user.updateChatContext("assistant", summary);

    Logger.info(user, `Completed processing document at path: ${path} with UUID: ${uuid}.`);
    return summary;
}