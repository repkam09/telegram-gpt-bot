import { ChatCompletionRequestMessage } from "openai";
import { Config } from "./config";
import { RedisCache } from "./redis";

export class ChatMemory {
    private static _chat_context_map = new Map<number, ChatCompletionRequestMessage[]>();
    private static _id_to_name = new Map<number, string>();
    private static _id_to_llm = new Map<number, string>();

    public static async hasContext(key: number): Promise<boolean> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._chat_context_map.has(key);
        }

        return RedisCache.has("context", `${key}`);
    }

    static async getContext(key: number): Promise<ChatCompletionRequestMessage[]> {
        if (!Config.USE_PERSISTANT_CACHE) {

            const result = this._chat_context_map.get(key) as ChatCompletionRequestMessage[];
            return Promise.resolve(result || []);
        }
        const result = await RedisCache.get<ChatCompletionRequestMessage[]>("context",`${key}`);
        return result || [];
    }

    static async deleteContext(key: number): Promise<void> {
        if (!Config.USE_PERSISTANT_CACHE) {
            this._chat_context_map.delete(key);
            return;
        }
        return RedisCache.delete("context",`${key}`);
    }

    static async setContext(key: number, value: ChatCompletionRequestMessage[]): Promise<void> {
        if (!Config.USE_PERSISTANT_CACHE) {
            this._chat_context_map.set(key, value);
            return;
        }
        return RedisCache.set("context",`${key}`, JSON.stringify(value));
    }

    static async getContextKeys(): Promise<number[]> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return Promise.resolve(Array.from(this._chat_context_map.keys()));
        }
        return [];
    }

    static async hasName(key: number): Promise<boolean> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._id_to_name.has(key);
        }
        return RedisCache.has("name",`${key}`);
    }

    static async getName(key: number): Promise<string> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._id_to_name.get(key) as string;
        }
        const result = await RedisCache.get<{ name: string }>("name",`${key}`);
        if (!result) {
            return "unknown";
        }
        return result.name;
    }

    static async getNameKeys(): Promise<number[]> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return Promise.resolve(Array.from(this._id_to_name.keys()));
        }
        return [];
    }

    static async setName(key: number, value: string) {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._id_to_name.set(key, value);
        }
        return RedisCache.set("name",`${key}`, JSON.stringify({ name: value }));
    }

    static async hasLLM(key: number): Promise<boolean> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._id_to_llm.has(key);
        }
        return RedisCache.has("llm",`${key}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async getLLM(key: number): Promise<string> {
        return Config.OPENAI_API_LLM;
    }

    static async setLLM(key: number, value: string) {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._id_to_llm.set(key, value);
        }
        return RedisCache.set("llm",`${key}`, JSON.stringify({ llm: value }));
    }

}