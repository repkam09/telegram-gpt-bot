import { Tool } from "ollama";
import { Logger } from "../singletons/logger";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { MemoryFileStore, MEMORY_ROOT } from "./memory/MemoryFileStore";

/**
 * Provider-agnostic implementation of the Anthropic memory tool
 * (https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool).
 * Exposed as a plain function tool so it works identically across OpenAI,
 * Anthropic, and Ollama. Storage is per-chat, backed by Prisma.
 */
export class MemoryTool extends BaseTool {
    public static isEnabled(): boolean {
        return Config.HENNOS_MEMORY_ENABLED;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "memory",
                description: [
                    `Manage your persistent memory directory ('${MEMORY_ROOT}'). Files in this directory persist across conversations and survive context resets.`,
                    "Call this tool with the 'view' command at the start of a task to check for relevant earlier context, notes, and user preferences.",
                    "As you work, record durable information: user preferences, important facts, decisions, and progress on multi-step tasks.",
                    "Keep the directory organized: update or remove stale files rather than creating duplicates, and do not create new files unless necessary.",
                    "Never store secrets such as passwords, API keys, or tokens in memory files. Prefer simple text like Markdown to facilitate viewing and editing them as needed.",
                    "Commands:",
                    "- view: show a directory listing or file contents (optionally a specific line range)",
                    "- create: create a new file (fails if the file already exists)",
                    "- str_replace: replace a unique string in a file with another string",
                    "- insert: insert text after a specific line number in a file",
                    "- delete: delete a file or directory (directories are deleted recursively)",
                    "- rename: rename or move a file or directory"
                ].join("\n"),
                parameters: {
                    type: "object",
                    properties: {
                        command: {
                            type: "string",
                            enum: ["view", "create", "str_replace", "insert", "delete", "rename"],
                            description: "The memory operation to perform."
                        },
                        path: {
                            type: "string",
                            description: `Absolute path within the memory directory, e.g. '${MEMORY_ROOT}/notes.md'. Required for all commands except 'rename'.`
                        },
                        view_range: {
                            type: "array",
                            items: { type: "integer" },
                            description: "Optional for 'view' on a file: [start_line, end_line] (1-indexed, end_line of -1 means end of file)."
                        },
                        file_text: {
                            type: "string",
                            description: "Required for 'create': the full content of the new file."
                        },
                        old_str: {
                            type: "string",
                            description: "Required for 'str_replace': the exact text to replace. Must appear exactly once in the file."
                        },
                        new_str: {
                            type: "string",
                            description: "For 'str_replace': the replacement text. Omit or pass an empty string to delete the matched text."
                        },
                        insert_line: {
                            type: "integer",
                            description: "Required for 'insert': the line number to insert after (0 inserts at the beginning of the file)."
                        },
                        insert_text: {
                            type: "string",
                            description: "Required for 'insert': the text to insert."
                        },
                        old_path: {
                            type: "string",
                            description: "Required for 'rename': the current path of the file or directory."
                        },
                        new_path: {
                            type: "string",
                            description: "Required for 'rename': the new path for the file or directory."
                        }
                    },
                    required: ["command"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `MemoryTool callback. ${JSON.stringify({ command: args.command, path: args.path ?? args.old_path })}`);

        try {
            const store = new MemoryFileStore(memoryScopeFromWorkflowId(workflowId));
            const result = await runMemoryCommand(store, args);
            return [result, metadata];
        } catch (err) {
            const error = err as Error;
            Logger.error(workflowId, `MemoryTool callback error. ${JSON.stringify({ command: args.command, err: error.message })}`, error);
            return [`Error: ${error.message}`, metadata];
        }
    }
}

export async function runMemoryCommand(store: MemoryFileStore, args: ToolCallFunctionArgs): Promise<string> {
    switch (args.command) {
        case "view":
            return store.view(args.path ?? MEMORY_ROOT, args.view_range);

        case "create":
            return store.create(args.path, args.file_text);

        case "str_replace":
            return store.strReplace(args.path, args.old_str, args.new_str);

        case "insert":
            return store.insert(args.path, args.insert_line, args.insert_text);

        case "delete":
            return store.delete(args.path);

        case "rename":
            return store.rename(args.old_path ?? args.path, args.new_path);

        default:
            return `Error: Unknown memory command '${args.command}'. Valid commands are: view, create, str_replace, insert, delete, rename.`;
    }
}

/**
 * Memory is scoped per-chat so it survives workflow compaction and
 * continue-as-new. Agent workflowIds are JSON: { platform, chatId, type }.
 * Parsed locally (instead of importing the temporal agent interface) to keep
 * the tool layer free of workflow module dependencies.
 */
export function memoryScopeFromWorkflowId(workflowId: string): string {
    try {
        const parsed = JSON.parse(workflowId) as { chatId?: string };
        if (parsed && typeof parsed.chatId === "string" && parsed.chatId.length > 0) {
            return parsed.chatId;
        }
    } catch {
        // Not a JSON workflowId, fall through to using it verbatim
    }

    return workflowId;
}
