import { Database } from "../../database";
import { getWatermark } from "./state";

/** The chat always keeps at least this many recent messages. */
export const MEMORY_RECENT_MESSAGES = 15;

/**
 * Extraction-aware chat window: the last 15 messages plus any message newer than the chat's extraction
 * watermark, capped at `cap`. The context only shrinks once a message's facts have been extracted, so the
 * nightly cadence does not create a recall gap. If extraction never runs the watermark never moves and the
 * window simply stays at the cap.
 */
export async function extractionAwareWindow(chatId: string, cap: number): Promise<number> {
    const watermark = await getWatermark(chatId);
    const unextracted = await Database.instance().messages.count({
        where: { chatId: Number(chatId), id: { gt: watermark ?? 0 } },
    });

    return Math.min(cap, Math.max(MEMORY_RECENT_MESSAGES, unextracted));
}
