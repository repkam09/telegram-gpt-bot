/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import axios from "axios";
import { Tool, ToolCall } from "ollama";
import { HennosConsumer } from "../singletons/base";
import { exec } from "child_process";
import { Logger } from "../singletons/logger";

export type ToolCallFunctionArgs = ToolCall["function"]["arguments"];
export type ToolCallMetadata = any;
export type ToolCallResponse = [string, ToolCallMetadata, string?];

export abstract class BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        throw new Error("Implemented by Subclass");
    }

    public static async callback(_req: HennosConsumer, _args: ToolCallFunctionArgs, _metadata: ToolCallMetadata): Promise<ToolCallResponse> {
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

    public static async fetchJSONData<T = any>(url: string, headers?: Record<string, string>): Promise<T> {
        const result = await axios({
            headers: {
                ...headers,
                "User-Agent": "HennosBot/1.0",
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

    public static async exec(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    return reject(error);
                }

                if (stderr) {
                    Logger.debug(undefined, "stderr", stderr);
                }

                Logger.debug(undefined, "stdout", stdout);
                return resolve(stdout);
            });
        });
    }
}