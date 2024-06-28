import {
    SimpleNodeParser,
    SummaryIndex,
    SummaryRetrieverMode,
    serviceContextFromDefaults,
    Ollama,
    OllamaEmbedding,
    ResponseSynthesizer,
    MetadataMode,
    BaseReader,
    FILE_EXT_TO_READER,
    OpenAI,
    OpenAIEmbedding,
    ServiceContext
} from "llamaindex";
import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";

export async function handleDocumentMessage(user: HennosUser, path: string, file_ext: string, uuid: string): Promise<string> {
    try {
        const reader = FILE_EXT_TO_READER[file_ext];
        if (!reader) {
            return `This document seems to be a ${file_ext} which is not yet supported.`;
        }
        return handleDocument(user, path, uuid, reader);

    } catch (err) {
        Logger.error(user, `Error while processing document at path ${path} with UUID ${uuid}.`, err);
        return "An error occured while processing your document.";
    }
}

async function buildServiceContext(user: HennosUser): Promise<ServiceContext> {
    const preferences = await user.getPreferences();
    if (preferences.provider === "ollama") {
        const serviceContext = serviceContextFromDefaults({
            llm: new Ollama({
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
                model: Config.OLLAMA_LLM_LARGE.MODEL,
                requestTimeout: 600000,
                contextWindow: Config.OLLAMA_LLM_LARGE.CTX
            }),
            embedModel: new OllamaEmbedding({
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
                contextWindow: Config.OLLAMA_LLM_EMBED.CTX,
                model: Config.OLLAMA_LLM_EMBED.MODEL,
                requestTimeout: 600000
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 1024,
                chunkOverlap: 128
            })
        });
        return serviceContext;
    }

    const serviceContext = serviceContextFromDefaults({
        llm: new OpenAI({
            model: "gpt-3.5-turbo",
            apiKey: Config.OPENAI_API_KEY,
        }),
        embedModel: new OpenAIEmbedding({
            model: "text-embedding-ada-002",
            apiKey: Config.OPENAI_API_KEY,
        }),
        nodeParser: new SimpleNodeParser({
            chunkSize: 2048,
            chunkOverlap: 256
        })
    });
    return serviceContext;
}

export async function handleDocument(user: HennosUser, path: string, uuid: string, reader: BaseReader): Promise<string> {
    Logger.info(user, `Processing document at path: ${path} with UUID: ${uuid}.`);

    const documents = await reader.loadData(path);
    const serviceContext = await buildServiceContext(user);

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

    await user.updateChatContext("user", "I just uploaded a document. Could you provide a summary of it?");
    await user.updateChatContext("assistant", summary);

    Logger.info(user, `Completed processing document at path: ${path} with UUID: ${uuid}.`);
    return summary;
}