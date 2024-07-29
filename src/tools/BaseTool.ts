/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Tool, ToolCall } from "ollama";
import { HennosConsumer } from "../singletons/base";
import axios from "axios";

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

}