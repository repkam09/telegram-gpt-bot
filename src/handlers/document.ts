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

async function buildServiceContext(user: HennosUser): Promise<ServiceContext> {
    const preferences = await user.getPreferences();
    if (preferences.provider === "ollama") {
        Logger.info(user, "Creating an Ollama service context for document processing based on user preferences");
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

    if (preferences.provider === "openai") {
        Logger.info(user, "Creating an OpenAI service context for document processing based on user preferences");
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

    if (preferences.provider === "anthropic") {
        Logger.info(user, "Creating an Anthropic service context for document processing based on user preferences");
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
    throw new Error(`Invalid LLM provider for user ${user.displayName} with value ${preferences.provider}`);
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

    Logger.info(user, `Completed processing document at path: ${path} with UUID: ${uuid}.`);
    return summary;
}