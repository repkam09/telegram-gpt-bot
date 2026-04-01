import fs from "node:fs/promises";
import path from "node:path";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { AgentResponseHandler } from "../response";

export class CreateArtifact extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "create_artifact",
                description: [
                    "Create a new text-based artifact (code file, HTML, Markdown, JSON, config, etc.) and send it to the user as a file.",
                    "Use this when the user explicitly asks for a file, a full program/module, multi-file output (provide per-file with separate calls), or large formatted content.",
                    "Do NOT use for short answers that fit in a normal chat reply. Keep content under 200k characters.",
                    "Filenames must include an extension. Allowed text extensions include: .txt .md .html .js .ts .json .py .sh .yaml .yml .sql and similar."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        filename: {
                            type: "string",
                            description: "Desired filename including extension (e.g. 'script.py', 'index.html')."
                        },
                        content: {
                            type: "string",
                            description: "Full textual content of the artifact. Must be plain text (no base64)."
                        },
                        mimeType: {
                            type: "string",
                            description: "MIME type of the file (e.g. 'text/plain', 'application/json')."
                        },
                        description: {
                            type: "string",
                            description: "Optional short caption/description to accompany the file when sent."
                        }
                    },
                    required: ["filename", "content", "mimeType"],
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `CreateArtifact callback. filename=${args.filename}, contentLength=${args.content?.length}`);

        // Basic validation
        if (!args.filename || !args.content || !args.mimeType) {
            return [JSON.stringify({ error: "'filename', 'content', and 'mimeType' are required" }), metadata];
        }

        const filename = sanitizeFilename(String(args.filename));
        if (!filename) {
            return [JSON.stringify({ error: "invalid filename after sanitization" }), metadata];
        }

        const ext = path.extname(filename).toLowerCase();

        // Write file
        const artifactDir = path.join(Config.LOCAL_STORAGE(workflowId), "artifacts");
        try {
            await fs.mkdir(artifactDir, { recursive: true });
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, "CreateArtifact: unable to ensure artifact directory. Error: " + error.message, error);
        }

        let targetPath = path.join(artifactDir, filename);
        const exists = await fileExists(targetPath);
        if (exists) {
            // Append timestamp to avoid clobber
            const base = path.basename(filename, ext);
            targetPath = path.join(artifactDir, `${base}_${Date.now()}${ext}`);
        }

        try {
            await fs.writeFile(targetPath, args.content, { encoding: "utf-8" });
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, "CreateArtifact write error. Error: " + error.message, error);
            return [
                JSON.stringify({ error: `failed to write file '${filename}'. ${error.message}` }),
                metadata
            ];
        }

        try {
            await AgentResponseHandler.handleArtifact(workflowId, targetPath, args.mimeType, args.description);
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, "CreateArtifact send error", error);
            return [
                JSON.stringify({ error: `failed to send file '${filename}' to user. ${error.message}` }),
                metadata
            ];
        }

        return [
            `create_artifact success: file '${path.basename(targetPath)}' created and sent to user. Local path: ${targetPath}.`,
            metadata
        ];
    }
}

function sanitizeFilename(name: string): string | null {
    if (!name) return null;
    // Remove path separators & null bytes
    const cleaned = name.replace(/\\/g, "/").replace(/\0/g, "").split("/").filter(Boolean).join("_");
    if (!cleaned) return null;
    if (cleaned.length > 180) return cleaned.slice(0, 180); // limit length
    return cleaned;
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

