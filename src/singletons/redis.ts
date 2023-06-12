import { createClient, RedisClientType } from "redis";
import { Config } from "./config";
import { Logger } from "./logger";

export class RedisCache {
    private static _redisInstance: RedisClientType;
    private static readonly KEY_PREFIX = "hennos";
    private static _local_cache = new Map<string, string>();

    public static async init() {
        if (!Config.USE_PERSISTANT_CACHE) {
            throw new Error("Redis should not be initialized when using in-memory cache");
        }

        const { host, port } = Config.USE_PERSISTANT_CACHE;
        this._redisInstance = createClient({
            url: `redis://${host}:${port}`
        });

        this._redisInstance.on("error", err => Logger.error("Redis Error: ", err));
        await this._redisInstance.connect();
        Logger.info("Redis Connected");
    }

    public static async has(type: string, key: string): Promise<boolean> {
        const result = await this._redisInstance.get(`${this.KEY_PREFIX}:${key}:${type}`);
        if (!result) {
            return false;
        }

        // Because of the way Redis seems to work, to check if a key exists we have to get it...
        // Because we usually check and then fetch, cache the result locally so we dont do another round trip
        this._local_cache.set(`${this.KEY_PREFIX}:${key}:${type}`, result);
        return true;
    }

    public static async get<T>(type: string, key: string): Promise<T | undefined> {
        let content: string | undefined | null;
        if (this._local_cache.has(`${this.KEY_PREFIX}:${key}:${type}`)) {
            content = this._local_cache.get(`${this.KEY_PREFIX}:${key}:${type}`);
            this._local_cache.delete(`${this.KEY_PREFIX}:${key}:${type}`);
        } else {
            content = await this._redisInstance.get(`${this.KEY_PREFIX}:${key}:${type}`);
        }

        if (!content) {
            return undefined;
        }

        return JSON.parse(content) as T;
    }

    public static async set(type: string, key: string, value: string) {
        await this._redisInstance.set(`${this.KEY_PREFIX}:${key}:${type}`, value);
    }

    public static async delete(type: string, key: string) {
        await this._redisInstance.del(`${this.KEY_PREFIX}:${key}:${type}`);
    }
}