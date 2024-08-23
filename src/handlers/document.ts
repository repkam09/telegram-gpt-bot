import {
    Anthropic,
    BaseReader,
    FILE_EXT_TO_READER,
    Ollama,
    OllamaEmbedding,
    OpenAI,
    OpenAIEmbedding,
    ResponseSynthesizer,
    ServiceContext,
    SimpleNodeParser,
    SummaryIndex,
    SummaryRetrieverMode,
    serviceContextFromDefaults,
} from "llamaindex";
import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";
import { Config } from "../singletons/config";
import { ValidAnthropicModels } from "../singletons/anthropic";
import { HennosConsumer } from "../singletons/base";
import { HennosGroup } from "../singletons/group";

export async function handleDocumentMessage(req: HennosConsumer, path: string, file_ext: string, uuid: string): Promise<string> {
    if (req instanceof HennosGroup) {
        return "Document processing is not supported for groups at this time.";
    }

    const user = req as HennosUser;
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

async function buildServiceContext(req: HennosConsumer): Promise<ServiceContext> {
    let provider = "openai";
    if (req instanceof HennosUser) {
        const preferences = await req.getPreferences();
        provider = preferences.provider;
    }

    if (provider === "ollama") {
        Logger.info(req, "Creating an Ollama service context for document processing based on user preferences");
        const serviceContext = serviceContextFromDefaults({
            llm: new Ollama({
                config: {
                    host: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
                    contextWindow: Config.OLLAMA_LLM_LARGE.CTX
                },
                model: Config.OLLAMA_LLM_LARGE.MODEL,
            }),
            embedModel: new OllamaEmbedding({
                config: {
                    host: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
                    contextWindow: Config.OLLAMA_LLM_EMBED.CTX
                },
                model: Config.OLLAMA_LLM_EMBED.MODEL,
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 2048,
                chunkOverlap: 256
            })
        });
        return serviceContext;
    }

    if (provider === "openai") {
        Logger.info(req, "Creating an OpenAI service context for document processing based on user preferences");
        const serviceContext = serviceContextFromDefaults({
            llm: new OpenAI({
                model: Config.OPENAI_LLM_LARGE.MODEL,
                apiKey: Config.OPENAI_API_KEY
            }),
            embedModel: new OpenAIEmbedding({
                model: Config.OPENAI_LLM_EMBED.MODEL,
                apiKey: Config.OPENAI_API_KEY,
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 2048,
                chunkOverlap: 256
            })
        });
        return serviceContext;
    }

    if (provider === "anthropic") {
        Logger.info(req, "Creating an Anthropic service context for document processing based on user preferences");
        const serviceContext = serviceContextFromDefaults({
            llm: new Anthropic({
                model: Config.ANTHROPIC_LLM.MODEL as ValidAnthropicModels,
                apiKey: Config.ANTHROPIC_API_KEY,
            }),
            embedModel: new OpenAIEmbedding({
                model: Config.OPENAI_LLM_EMBED.MODEL,
                apiKey: Config.OPENAI_API_KEY,
            }),
            nodeParser: new SimpleNodeParser({
                chunkSize: 2048,
                chunkOverlap: 256
            })
        });
        return serviceContext;
    }
    throw new Error(`Invalid LLM provider for ${req.displayName} with value ${provider}`);
}

export async function handleDocument(req: HennosConsumer, path: string, uuid: string, reader: BaseReader, prompt?: string): Promise<string> {
    Logger.info(req, `Processing document at path: ${path} with UUID: ${uuid}.`);

    const documents = await reader.loadData(path);
    const serviceContext = await buildServiceContext(req);

    Logger.debug(`Loaded ${documents.length} documents from path: ${path} with UUID: ${uuid}.`);
    const index = await SummaryIndex.fromDocuments(documents, {
        serviceContext
    });

    Logger.debug(`Created a summary index from ${documents.length} documents at path: ${path} with UUID: ${uuid}.`);
    const queryEngine = index.asQueryEngine({
        responseSynthesizer: new ResponseSynthesizer({
            serviceContext
        }),
        retriever: index.asRetriever({
            mode: SummaryRetrieverMode.DEFAULT,
        })
    });

    Logger.debug(`Created a query engine from the summary index at path: ${path} with UUID: ${uuid}.`);
    const response = await queryEngine.query({
        query: prompt ? prompt : "Create a summary of this document.",
    });

    Logger.debug(`Queried the query engine from the summary index at path: ${path} with UUID: ${uuid}.`);
    const summary = response.toString();

    Logger.info(req, `Completed processing document at path: ${path} with UUID: ${uuid}.`);
    return summary;
}