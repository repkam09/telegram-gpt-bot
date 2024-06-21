import { VectorStoreIndex, QdrantVectorStore, OllamaEmbedding, Ollama, SimpleNodeParser, PromptHelper } from "llamaindex";
import { Config } from "./config";

export class Vector {
    private static _index: VectorStoreIndex;

    public static async init() {
        const vectorStore = new QdrantVectorStore({
            url: `http://${Config.QDRANT_HOST}:${Config.QDRANT_PORT}`,
        });

        const index = await VectorStoreIndex.fromVectorStore(vectorStore, {
            callbackManager: {},
            nodeParser: new SimpleNodeParser(),
            promptHelper: new PromptHelper(),
            embedModel: new OllamaEmbedding({
                model: Config.OLLAMA_LLM_EMBED.MODEL,
                contextWindow: Config.OLLAMA_LLM_EMBED.CTX,
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
            }),
            llm: new Ollama({
                model: Config.OLLAMA_LLM_LARGE.MODEL,
                contextWindow: Config.OLLAMA_LLM_LARGE.CTX,
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
            })
        });

        Vector._index = index;
    }

    public static instance(): VectorStoreIndex {
        return this._index;
    }
}