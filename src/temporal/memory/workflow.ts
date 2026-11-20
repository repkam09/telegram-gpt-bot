import { log, proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";

const { listChatsWithNewMessages } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { processChatMemory } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 minutes",
    heartbeatTimeout: "1 minute", // withActivityHeartbeat beats every 5s, so a dead worker is noticed quickly
    retry: {
        backoffCoefficient: 1,
        initialInterval: "10 seconds",
        maximumAttempts: 2,
    },
});

export type MemoryBatchSummary = {
    chats: number;
    processed: number;
    failed: number;
    stoppedEarly: number;
    changes: number;
}

/**
 * Nightly memory extraction: one activity lists the chats with new messages, then one activity per chat
 * runs the gate, the extraction and the watermark update. A failure in one chat never fails the run;
 * its watermark stays where it was, so the next run picks up.
 */
export async function memoryBatchWorkflow(): Promise<MemoryBatchSummary> {
    const { chatIds, concurrency } = await listChatsWithNewMessages();
    const summary: MemoryBatchSummary = { chats: chatIds.length, processed: 0, failed: 0, stoppedEarly: 0, changes: 0 };

    const size = Math.max(1, concurrency);
    for (let start = 0; start < chatIds.length; start += size) {
        await Promise.all(chatIds.slice(start, start + size).map(async (chatId) => {
            try {
                const result = await processChatMemory(chatId);
                summary.processed++;
                if (result.stopped !== "done") {
                    summary.stoppedEarly++;
                }
                summary.changes += result.chunks.reduce((total, chunk) => total + chunk.changes.length, 0);
            } catch (err: unknown) {
                summary.failed++;
                log.error(`Memory extraction failed for chat ${chatId}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }));
    }

    log.info(`Memory batch complete: ${JSON.stringify(summary)}`);
    return summary;
}
