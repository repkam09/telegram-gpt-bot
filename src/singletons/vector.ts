import { VectorStoreIndex, QdrantVectorStore, OllamaEmbedding, Ollama, SimpleNodeParser, PromptHelper } from "llamaindex";
import { Config } from "./config";

export class Vector {
    private static _index: VectorStoreIndex;

    public static async init() {
        const vectorStore = new QdrantVectorStore({
            url: "http://localhost:6333",
        });

        const index = await VectorStoreIndex.fromVectorStore(vectorStore, {
            callbackManager: {},
            nodeParser: new SimpleNodeParser(),
            promptHelper: new PromptHelper(),
            embedModel: new OllamaEmbedding({
                model: "nomic-embed-text",
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
                contextWindow: 4096
            }),
            llm: new Ollama({
                model: "tinyllama",
                baseURL: `http://${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`,
            })
        });

        Vector._index = index;
    }

    public static instance(): VectorStoreIndex {
        return this._index;
    }
}