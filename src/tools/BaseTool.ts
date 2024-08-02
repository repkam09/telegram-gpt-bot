/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import axios from "axios";
import { Tool, ToolCall } from "ollama";
import { HennosConsumer } from "../singletons/base";

export type ToolCallFunctionArgs = ToolCall["function"]["arguments"];
export type ToolCallMetadata = any;

export abstract class BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        throw new Error("Implemented by Subclass");
    }

    public static async callback(_req: HennosConsumer, _args: ToolCallFunctionArgs, _metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        throw new Error("Implemented by Subclass");
    }

    public static async fetchTextData(url: string): Promise<string> {
        const result = await axios({
            headers: {
                "User-Agent": "HennosBot/1.0"
            },
            method: "get",
            url: url,
            responseType: "text"
        });

        return result.data;
    }

    public static async fetchJSONData<T = any>(url: string): Promise<T> {
        const result = await axios({
            headers: {
                "User-Agent": "HennosBot/1.0"
            },
            method: "get",
            url: url,
            responseType: "json"
        });

        return result.data as T;
    }

    public static async fetchBinaryData(url: string): Promise<Buffer> {
        const result = await axios({
            headers: {
                "User-Agent": "HennosBot/1.0"
            },
            method: "get",
            url: url,
            responseType: "arraybuffer"
        });

        return Buffer.from(result.data);
    }
}