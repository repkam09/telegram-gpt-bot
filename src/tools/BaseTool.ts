/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import axios from "axios";
import { Tool, ToolCall } from "ollama";
import { HennosConsumer } from "../singletons/base";
import { exec } from "child_process";
import { Logger } from "../singletons/logger";
import { HennosResponse } from "../types";

export type ToolCallFunctionArgs = ToolCall["function"]["arguments"];
export type ToolCallMetadata = any;
export type ToolCallResponse = [string, ToolCallMetadata, HennosResponse?];

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
        const result = await BaseTool.fetchAxios<string>(url, "text");
        return result.data;
    }

    public static async fetchJSONData<T = any>(url: string, headers?: Record<string, string>): Promise<T> {
        const result = await BaseTool.fetchAxios<T>(url, "json", headers);
        return result.data as T;
    }

    public static async postJSONData<T = any>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
        Logger.debug(undefined, "postJSONData", { url, body, headers });
        const result = await axios({
            data: body,
            headers: {
                ...headers,
                "User-Agent": "HennosBot/1.0",
            },
            method: "post",
            url: url,
            responseType: "json"
        });

        return result.data as T;
    }

    public static async fetchBinaryData(url: string): Promise<Buffer> {
        const result = await BaseTool.fetchAxios<any>(url, "arraybuffer");
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

    private static fetchAxios<T>(url: string, responseType: "text" | "json" | "arraybuffer", headers?: Record<string, string>): Promise<{ data: T }> {
        Logger.debug(undefined, "fetchAxios", { url, responseType, headers });
        return axios<T>({
            headers: {
                ...headers,
                "User-Agent": "HennosBot/1.0"
            },
            method: "get",
            url: url,
            responseType: responseType
        });
    }
}