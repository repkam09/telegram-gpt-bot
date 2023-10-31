import { ChatCompletionRequestMessage } from "openai";
import { Config } from "./config";
import { RedisCache } from "./redis";

export type HennosChatCompletionRequestMessage = ChatCompletionRequestMessage & {
    timestamp: string
}

export class ChatMemory {
    private static _chat_context_map = new Map<number, HennosChatCompletionRequestMessage[]>();
    private static _id_to_name = new Map<number, string>();

    private static _map_to_map = new Map<string, Map<string, string>>();

    public static async hasContext(key: number): Promise<boolean> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._chat_context_map.has(key);
        }

        return RedisCache.has("context", `${key}`);
    }

    static async getContext(key: number): Promise<HennosChatCompletionRequestMessage[]> {
        if (!Config.USE_PERSISTANT_CACHE) {

            const result = this._chat_context_map.get(key) as HennosChatCompletionRequestMessage[];
            return Promise.resolve(result || []);
        }
        const result = await RedisCache.get<HennosChatCompletionRequestMessage[]>("context", `${key}`);
        return result || [];
    }

    static async deleteContext(key: number): Promise<void> {
        if (!Config.USE_PERSISTANT_CACHE) {
            this._chat_context_map.delete(key);
            return;
        }
        return RedisCache.delete("context", `${key}`);
    }

    static async setContext(key: number, value: HennosChatCompletionRequestMessage[]): Promise<void> {
        if (!Config.USE_PERSISTANT_CACHE) {
            this._chat_context_map.set(key, value);
            return;
        }
        return RedisCache.set("context", `${key}`, JSON.stringify(value));
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
        return RedisCache.has("name", `${key}`);
    }

    static async getName(key: number): Promise<string> {
        if (!Config.USE_PERSISTANT_CACHE) {
            return this._id_to_name.get(key) as string;
        }
        const result = await RedisCache.get<{ name: string }>("name", `${key}`);
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
        return RedisCache.set("name", `${key}`, JSON.stringify({ name: value }));
    }

    static async storePerUserValue<T>(userId: number, prop: string, value: T): Promise<void> {
        if (!Config.USE_PERSISTANT_CACHE) {
            if (!this._map_to_map.has(prop)) {
                this._map_to_map.set(prop, new Map<string, string>());
            }

            const map = this._map_to_map.get(prop) as Map<string, string>;
            map.set(`${userId}`, JSON.stringify(value));
            return;
        }

        return RedisCache.set(prop, `${userId}`, JSON.stringify(value));
    }

    static async getPerUserValue<T>(userId: number, prop: string): Promise<T | undefined> {
        if (!Config.USE_PERSISTANT_CACHE) {
            if (!this._map_to_map.has(prop)) {
                this._map_to_map.set(prop, new Map<string, string>());
            }

            const map = this._map_to_map.get(prop) as Map<string, string>;
            const stringValue = map.get(`${userId}`);
            if (!stringValue) {
                return undefined;
            }
            return JSON.parse(stringValue);
        }

        return RedisCache.get<T>(prop, `${userId}`);
    }

    static async hasPerUserValue(userId: number, prop: string): Promise<boolean> {
        if (!Config.USE_PERSISTANT_CACHE) {
            if (!this._map_to_map.has(prop)) {
                this._map_to_map.set(prop, new Map<string, string>());
            }

            const map = this._map_to_map.get(prop) as Map<string, string>;
            return map.has(`${userId}`);
        }

        return RedisCache.has(prop, `${userId}`);
    }


    static async storeSystemValue<T>(prop: string, value: T): Promise<void> {
        if (!Config.USE_PERSISTANT_CACHE) {
            if (!this._map_to_map.has(prop)) {
                this._map_to_map.set(prop, new Map<string, string>());
            }

            const map = this._map_to_map.get(prop) as Map<string, string>;
            map.set("system_value", JSON.stringify(value));
            return;
        }

        return RedisCache.set(prop, "system_value", JSON.stringify(value));
    }

    static async getSystemValue<T>(prop: string): Promise<T | undefined> {
        if (!Config.USE_PERSISTANT_CACHE) {
            if (!this._map_to_map.has(prop)) {
                this._map_to_map.set(prop, new Map<string, string>());
            }

            const map = this._map_to_map.get(prop) as Map<string, string>;
            const stringValue = map.get("system_value");
            if (!stringValue) {
                return undefined;
            }
            return JSON.parse(stringValue);
        }

        return RedisCache.get<T>(prop, "system_value");
    }

    static async hasSystemValue(prop: string): Promise<boolean> {
        if (!Config.USE_PERSISTANT_CACHE) {
            if (!this._map_to_map.has(prop)) {
                this._map_to_map.set(prop, new Map<string, string>());
            }

            const map = this._map_to_map.get(prop) as Map<string, string>;
            return map.has("system_value");
        }

        return RedisCache.has(prop, "system_value");
    }
}