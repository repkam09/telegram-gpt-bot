import { CompletionContextEntry, resolveModelProvider } from "../../provider";
import { Logger } from "../../singletons/logger";
import { MemoryTool, runMemoryCommand } from "../../tools/MemoryTool";
import { MemoryFileStore } from "../../tools/memory/MemoryFileStore";
import { formatExtractionTranscript, memoryExtractionPrompt } from "./prompt";
import type { MemoryMessage } from "./gate";

export const MAX_EXTRACTION_ITERATIONS = 6;

export type MemoryChange = { command: string; path: string };

export type ExtractionResult = {
    iterations: number;
    changes: MemoryChange[];
    summary: string;
}

const READ_ONLY_COMMANDS = new Set(["view"]);

/**
 * Runs the bounded extraction tool loop for one chunk of messages on the low tier, with only the memory tool.
 * Commands run through `runMemoryCommand` on the real `MemoryFileStore`, so its size and path guards apply.
 * Throws on provider errors; the caller keeps the watermark in that case.
 */
export async function extractMemories(workflowId: string, chatId: string, messages: MemoryMessage[]): Promise<ExtractionResult> {
    const provider = await resolveModelProvider(workflowId, "low");
    const store = new MemoryFileStore(chatId);
    const tools = [MemoryTool.definition()];

    const context: CompletionContextEntry[] = [
        { role: "system", content: memoryExtractionPrompt() },
        { role: "user", content: formatExtractionTranscript(messages) },
    ];

    const changes: MemoryChange[] = [];

    for (let iteration = 0; iteration < MAX_EXTRACTION_ITERATIONS; iteration++) {
        const response = await provider.completion(workflowId, context, iteration, tools);

        if (response.__type === "string") {
            return { iterations: iteration + 1, changes, summary: response.payload };
        }

        for (const call of response.payload) {
            context.push({ role: "tool_call", name: call.name, input: call.input, id: call.id });

            let result: string;
            if (call.name !== "memory") {
                result = `Error: Unknown tool '${call.name}'. Only 'memory' is available.`;
            } else {
                try {
                    result = await runMemoryCommand(store, call.input);
                    const command = String(call.input.command);
                    if (!READ_ONLY_COMMANDS.has(command) && !result.startsWith("Error")) {
                        changes.push({ command, path: String(call.input.path ?? call.input.old_path ?? "") });
                    }
                } catch (err: unknown) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    Logger.warn(workflowId, `Memory extraction tool call failed: ${error.message}`);
                    result = `Error: ${error.message}`;
                }
            }

            context.push({ role: "tool_response", id: call.id, result });
        }
    }

    Logger.warn(workflowId, `Memory extraction hit the iteration cap (${MAX_EXTRACTION_ITERATIONS}) with ${changes.length} changes`);
    return { iterations: MAX_EXTRACTION_ITERATIONS, changes, summary: "iteration cap reached" };
}
