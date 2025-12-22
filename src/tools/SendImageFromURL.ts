import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { HennosConsumer } from "../singletons/consumer";

export class SendImageFromURL extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "send_image_from_url",
                description: [
                    "Download an image from a URL and send it to the user as an image message.",
                    "Use only for direct image file URLs (jpg, jpeg, png, gif, webp). Do NOT use for HTML pages.",
                    "If the URL does not clearly point to an image, skip calling this tool and explain instead.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        url: { type: "string", description: "Direct URL of the image (must end with an image extension or return image content)." },
                        caption: { type: "string", description: "Optional short caption to include with the image." }
                    },
                    required: ["url"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.url) {
            return ["send_image_from_url error: 'url' parameter is required", metadata];
        }

        const url = String(args.url).trim();
        Logger.info(req, `SendImageFromURL callback. ${JSON.stringify({ url })}`);

        if (!/^https?:\/\//i.test(url)) {
            return ["send_image_from_url error: URL must start with http or https", metadata];
        }

        // Basic extension heuristic (still allow attempt if missing but warn)
        const imageExtMatch = url.match(/\.(png|jpe?g|gif|webp)$/i);
        if (!imageExtMatch) {
            Logger.debug(req, "SendImageFromURL: URL lacks typical image extension, will attempt fetch anyway.");
        }

        const tempName = `img_${randomUUID()}${imageExtMatch ? imageExtMatch[0].toLowerCase() : ".tmp"}`;
        const filePath = path.join(Config.LOCAL_STORAGE(req), tempName);

        try {
            const data = await BaseTool.fetchBinaryData(url);
            // Quick MIME sniff (simple signatures) to guard against HTML pages
            if (looksLikeHTML(data)) {
                return ["send_image_from_url error: Fetched content appears to be HTML, not an image.", metadata];
            }

            await fs.writeFile(filePath, data);
            await TelegramBotInstance.sendImageWrapper(req, filePath, { caption: args.caption?.slice(0, 900) });
            return [
                `send_image_from_url success: image downloaded and sent to user from '${url}'. Local path: ${filePath}`,
                metadata
            ];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "SendImageFromURL error", error);
            return [
                `send_image_from_url error: failed to download or send image from '${url}'. ${error.message}`,
                metadata
            ];
        }
    }
}

function looksLikeHTML(buf: Buffer): boolean {
    const head = buf.slice(0, 512).toString("utf8").toLowerCase();
    return head.includes("<html") || head.includes("<!doctype html");
}
