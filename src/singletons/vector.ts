import { QdrantClient } from "@qdrant/js-client-rest";
import { Config } from "./config";
import { HennosConsumer } from "./base";
import { Logger } from "./logger";
import { Ollama } from "ollama";

export type Payload = {
    content: string;
}

export type VectorData = {
    id: string,
    payload: Payload
}

export class Vector {
    private static _qdrantClient: QdrantClient;
    private static _ollama: Ollama;

    public static async init() {
        this._qdrantClient = new QdrantClient({ url: `http://${Config.QDRANT_HOST}:${Config.QDRANT_PORT}` });
        this._ollama = new Ollama({
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        });
    }

    public static instance(): QdrantClient {
        return this._qdrantClient;
    }

    public static async upsert(req: HennosConsumer, id: string, content: string): Promise<void> {
        if (!Config.QDRANT_ENABLED) {
            return;
        }

        try {
            const [collectionName, vector] = await Promise.all([
                Vector.prepareUserCollection(req),
                Vector.encode(req, content)
            ]);

            await Vector.instance().upsert(collectionName, {
                points: [
                    {
                        id: id,
                        vector,
                        payload: {
                            content
                        }
                    }
                ]
            });
        } catch (error) {
            Logger.error(req, `Error uploading data ${id}:`, error);
        }
    }

    public static async search(req: HennosConsumer, query: string, limit: number): Promise<VectorData[]> {
        if (!Config.QDRANT_ENABLED) {
            return [];
        }

        try {
            const [collectionName, vector] = await Promise.all([
                Vector.prepareUserCollection(req),
                Vector.encode(req, query)
            ]);

            const searchResults = await Vector.instance().search(collectionName, {
                params: {
                    hnsw_ef: 128,
                    exact: false,
                },
                vector,
                limit
            });

            return searchResults.map((result) => ({
                id: String(result.id),
                payload: decodePayload(req, result.payload)
            }));
        } catch (error) {
            Logger.error(req, "Error during search:", error);
        }

        return [];
    }

    private static async encode(req: HennosConsumer, text: string): Promise<number[]> {
        Logger.info(req, `Ollama Embeddings Start (${Config.OLLAMA_LLM_EMBED.MODEL})`);
        try {
            const response = await this._ollama.embed({
                model: Config.OLLAMA_LLM_EMBED.MODEL,
                input: text
            });

            Logger.info(req, "Ollama Embeddings Success");
            return response.embeddings[0];
        } catch (err: unknown) {
            Logger.error(req, "Ollama Embeddings Error: ", err);
            throw err;
        }
    }

    private static async prepareUserCollection(req: HennosConsumer): Promise<string> {
        const collectionName = `${req.chatId}-${Config.QDRANT_DIMENSONS}`;
        const result = await Vector.instance().collectionExists(collectionName);
        if (!result.exists) {
            await Vector.instance().createCollection(collectionName, {
                vectors: {
                    size: Config.QDRANT_DIMENSONS,
                    distance: "Dot"
                }
            });
        }

        return collectionName;
    }
}

function decodePayload(req: HennosConsumer, payload: unknown): Payload {
    if (typeof payload !== "object" || payload === null) {
        Logger.error(req, "Invalid Vector Payload", payload);
        throw new Error("Invalid Vector Payload");
    }

    const payloadObject = payload as Record<string, unknown>;
    if (!payloadObject.content || typeof payloadObject.content !== "string") {
        Logger.error(req, "Invalid Vector Payload Content", payload);
        throw new Error("Invalid Vector Payload Content");
    }

    return payloadObject as Payload;
}