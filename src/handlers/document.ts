import {
    BaseReader,
    FILE_EXT_TO_READER,
    ResponseSynthesizer,
    SummaryIndex,
    SummaryRetrieverMode,
} from "llamaindex";
import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/consumer";
import { HennosConsumer, HennosGroup } from "../singletons/consumer";

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

    } catch (err: unknown) {
        const error = err as Error;
        Logger.error(user, `Error while processing document at path ${path} with UUID ${uuid}.`, error);
        return "An error occured while processing your document.";
    }
}

export async function handleDocument(req: HennosConsumer, path: string, uuid: string, reader: BaseReader, prompt?: string): Promise<string> {
    Logger.info(req, `Processing document at path: ${path} with UUID: ${uuid}.`);

    const documents = await reader.loadData(path);
    const serviceContext = req.getServiceContext();

    Logger.debug(req, `Loaded ${documents.length} documents from path: ${path} with UUID: ${uuid}.`);
    const index = await SummaryIndex.fromDocuments(documents, {
        serviceContext
    });

    Logger.debug(req, `Created a summary index from ${documents.length} documents at path: ${path} with UUID: ${uuid}.`);
    const queryEngine = index.asQueryEngine({
        responseSynthesizer: new ResponseSynthesizer({
            serviceContext
        }),
        retriever: index.asRetriever({
            mode: SummaryRetrieverMode.DEFAULT,
        })
    });

    Logger.debug(req, `Created a query engine from the summary index at path: ${path} with UUID: ${uuid}.`);
    const response = await queryEngine.query({
        query: prompt ? prompt : "Can you provide a summary of this document?"
    });

    Logger.debug(req, `Queried the query engine from the summary index at path: ${path} with UUID: ${uuid}.`);
    const summary = response.toString();

    Logger.info(req, `Completed processing document at path: ${path} with UUID: ${uuid}.`);
    return summary;
}