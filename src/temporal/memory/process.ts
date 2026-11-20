import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { extractMemories } from "./extract";
import { MemoryGateSignals, runGate } from "./gate";
import { backfillStart, getWatermark, nextChunk, setWatermark } from "./state";

export type ChunkSummary = {
    firstMessageId: number;
    lastMessageId: number;
    messages: number;
    gate: { extract: boolean; reason: string; signals: MemoryGateSignals };
    changes: { command: string; path: string }[];
}

export type ChatMemoryResult = {
    chatId: string;
    chunks: ChunkSummary[];
    /** Why the run for this chat ended: nothing left, the per-run chunk cap, or an error (watermark kept). */
    stopped: "done" | "chunk_cap" | "error";
    error?: string;
}

/**
 * Gate, extraction and watermark for one chat, oldest messages first in chunks.
 * Each chunk: gate -> (extract) -> advance the watermark. A gate or extraction error stops this chat for the
 * night and leaves the watermark at the last fully processed chunk, so the next run picks up from there.
 */
export async function processChat(chatId: string, onProgress: () => void = () => undefined): Promise<ChatMemoryResult> {
    const workflowId = `memory-extraction:${chatId}`;
    const chunkSize = Config.HENNOS_MEMORY_CHUNK_MESSAGES;
    const maxChunks = Config.HENNOS_MEMORY_MAX_CHUNKS;

    const result: ChatMemoryResult = { chatId, chunks: [], stopped: "done" };

    let cursor = await getWatermark(chatId);
    if (cursor === null) {
        cursor = await backfillStart(chatId, Config.HENNOS_MEMORY_BACKFILL_MESSAGES);
        Logger.info(workflowId, `No memory watermark yet, backfilling from message id ${cursor}`);
    }

    for (let index = 0; ; index++) {
        const chunk = await nextChunk(chatId, cursor, chunkSize);
        if (chunk.length === 0) {
            return result;
        }

        if (index >= maxChunks) {
            Logger.info(workflowId, `Memory chunk cap (${maxChunks}) reached, the rest continues the next run`);
            result.stopped = "chunk_cap";
            return result;
        }

        onProgress();
        const first = chunk[0].id;
        const last = chunk[chunk.length - 1].id;

        try {
            const gate = await runGate(chunk);
            Logger.info(workflowId, `Memory gate for messages ${first}-${last}: extract=${gate.extract} (${gate.reason}) signals=${JSON.stringify(gate.signals)}`);

            let changes: { command: string; path: string }[] = [];
            if (gate.extract) {
                const extraction = await extractMemories(workflowId, chatId, chunk);
                changes = extraction.changes;
                Logger.info(workflowId, `Memory extraction for messages ${first}-${last}: ${extraction.changes.length} changes (${JSON.stringify(extraction.changes)}). ${extraction.summary}`);
            }

            await setWatermark(chatId, last);
            cursor = last;
            result.chunks.push({ firstMessageId: first, lastMessageId: last, messages: chunk.length, gate, changes });
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            Logger.warn(workflowId, `Memory processing stopped for messages ${first}-${last}, watermark kept: ${error.message}`);
            result.stopped = "error";
            result.error = error.message;
            return result;
        }
    }
}
