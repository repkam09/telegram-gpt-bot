/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Tool, ToolCall } from "ollama";
import { exec } from "child_process";
import { Logger } from "../singletons/logger";

export type ToolCallFunctionArgs = ToolCall["function"]["arguments"];
export type ToolCallMetadata = any;
export type ToolCallResponse = [string, ToolCallMetadata];

const HENNOS_USER_AGENT = "HennosBot/1.0";

export type HennosBaseTool = {
    isEnabled: () => boolean;
    definition: () => Tool;
    callback: (workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata) => Promise<ToolCallResponse>;
}

export abstract class BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        throw new Error("Implemented by Subclass");
    }

    public static async callback(_workflowId: string, _args: ToolCallFunctionArgs, _metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        throw new Error("Implemented by Subclass");
    }

    public static async fetchTextData(url: string): Promise<string> {
        const result = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": HENNOS_USER_AGENT
            }
        });

        if (!result.ok) {
            throw new Error(`HTTP request failed with status ${result.status}`);
        }

        const data = await result.text();
        return data;
    }

    public static async fetchJSONData<T = any>(url: string, headers?: Record<string, string>): Promise<T> {
        const result = await fetch(url, {
            method: "GET",
            headers: {
                ...headers,
                "User-Agent": HENNOS_USER_AGENT
            }
        });

        if (!result.ok) {
            throw new Error(`HTTP request failed with status ${result.status}`);
        }

        const data = await result.json();
        return data as T;
    }

    public static async postJSONData<T = any>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
        Logger.debug(undefined, `postJSONData: ${JSON.stringify({ url, body, headers })}`);
        const result = await fetch(url, {
            method: "POST",
            headers: {
                ...headers,
                "User-Agent": HENNOS_USER_AGENT,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!result.ok) {
            throw new Error(`HTTP request failed with status ${result.status}`);
        }

        const data = await result.json();
        return data as T;
    }
}