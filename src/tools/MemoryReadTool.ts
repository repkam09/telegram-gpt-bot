import type { HennosTool } from "../provider";
import { Logger } from "../singletons/logger";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";
import { MemoryFileStore, MEMORY_ROOT } from "./memory/MemoryFileStore";
import { memoryScopeFromWorkflowId } from "./MemoryTool";

/**
 * Read-only view of the user's memory for the chat model. Memory is written only by the nightly extraction,
 * so the only command is `view`. The restriction is enforced in the callback, not just the schema,
 * so a confused model cannot write even if it tries another command.
 */
export class MemoryReadTool extends BaseTool {
    public static isEnabled(): boolean {
        return Config.HENNOS_MEMORY_ENABLED;
    }

    public static definition(): HennosTool {
        return {
            type: "function",
            function: {
                name: "memory",
                description: [
                    `Read the long-term notes kept about the user in '${MEMORY_ROOT}'. This is read-only: notes are updated by a background process, never by you.`,
                    "Use 'view' with no path (or the directory) to list the files, or with a file path to read it.",
                    "Use it when the user asks what you remember about them, or when a file listed in your memory index would change your answer.",
                ].join("\n"),
                parameters: {
                    type: "object",
                    properties: {
                        command: {
                            type: "string",
                            enum: ["view"],
                            description: "The only supported command is 'view'."
                        },
                        path: {
                            type: "string",
                            description: `Absolute path within the memory directory, e.g. '${MEMORY_ROOT}/profile.md'. Defaults to the directory.`
                        },
                        view_range: {
                            type: "array",
                            items: { type: "integer" },
                            description: "Optional for a file: [start_line, end_line] (1-indexed, end_line of -1 means end of file)."
                        }
                    },
                    required: ["command"]
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (args.command !== "view") {
            Logger.warn(workflowId, `MemoryReadTool rejected command '${String(args.command)}'`);
            return ["Error: memory is read-only. Only the 'view' command is available; memory is updated by a background process.", metadata];
        }

        try {
            const store = new MemoryFileStore(memoryScopeFromWorkflowId(workflowId));
            return [await store.view(args.path ?? MEMORY_ROOT, args.view_range), metadata];
        } catch (err) {
            const error = err as Error;
            Logger.error(workflowId, `MemoryReadTool callback error. ${JSON.stringify({ err: error.message })}`, error);
            return [`Error: ${error.message}`, metadata];
        }
    }
}
