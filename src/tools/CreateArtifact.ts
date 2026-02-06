import fs from "node:fs/promises";
import path from "node:path";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Logger } from "../singletons/logger";
import { Config } from "../singletons/config";
import { AgentResponseHandler } from "../temporal/agent/interface";

/**
 * CreateArtifact allows the model to create a text-based file artifact (code, HTML, Markdown, JSON, etc.)
 * and send it back to the user as a Telegram document. Use this when:
 *  - The user asks for a complete file (e.g. "make an index.html", "give me a Dockerfile", "write a script.py").
 *  - The content would exceed normal message limits or is easier to consume as a file.
 *  - You need to provide multiple lines of code with exact formatting preserved.
 */
export class CreateArtifact extends BaseTool {
    private static readonly MAX_CONTENT_LENGTH = 200_000; // ~200 KB safeguard
    private static readonly ALLOWED_EXTENSIONS = new Set([
        ".txt", ".md", ".markdown", ".html", ".htm", ".css", ".js", ".cjs", ".mjs",
        ".ts", ".tsx", ".jsx", ".json", ".yml", ".yaml", ".xml", ".csv", ".py", ".sh",
        ".bash", ".zsh", ".sql", ".ini", ".cfg", ".conf", ".toml", ".env"
    ]);

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
                        description: {
                            type: "string",
                            description: "Optional short caption/description to accompany the file when sent."
                        }
                    },
                    required: ["filename", "content"],
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `CreateArtifact callback. filename=${args.filename}, contentLength=${args.content?.length}`);

        // Basic validation
        if (!args.filename || !args.content) {
            return ["create_artifact error: 'filename' and 'content' are required", metadata];
        }

        const filename = sanitizeFilename(String(args.filename));
        if (!filename) {
            return ["create_artifact error: invalid filename after sanitization", metadata];
        }

        if (args.content.length > CreateArtifact.MAX_CONTENT_LENGTH) {
            return [
                `create_artifact error: content length (${args.content.length}) exceeds limit of ${CreateArtifact.MAX_CONTENT_LENGTH} characters. Please summarize or split into smaller files.`,
                metadata
            ];
        }

        const ext = path.extname(filename).toLowerCase();
        if (!CreateArtifact.ALLOWED_EXTENSIONS.has(ext)) {
            // Allow but warn; you could also reject. We'll allow to keep flexibility.
            Logger.warn(workflowId, `CreateArtifact: extension ${ext} not in ALLOWED_EXTENSIONS, proceeding anyway.`);
        }

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
                `create_artifact error: failed to write file '${filename}'. ${error.message}`,
                metadata
            ];
        }

        let sent = false;
        try {
            await AgentResponseHandler.handleArtifact(workflowId, targetPath, args.description);
            sent = true;
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, "CreateArtifact send error", error);
        }

        return [
            `create_artifact success: file '${path.basename(targetPath)}' ${sent ? "created and sent" : "created"}. Local path: ${targetPath}.`,
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

