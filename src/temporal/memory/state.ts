import { Database } from "../../database";
import type { MemoryMessage } from "./gate";

const EXTRACTABLE_ROLES = ["user", "assistant"];

export async function getWatermark(chatId: string): Promise<number | null> {
    const row = await Database.instance().memoryExtractionState.findUnique({
        where: { chatId: BigInt(chatId) },
        select: { lastMessageId: true },
    });

    return row ? row.lastMessageId : null;
}

export async function setWatermark(chatId: string, lastMessageId: number): Promise<void> {
    await Database.instance().memoryExtractionState.upsert({
        where: { chatId: BigInt(chatId) },
        create: { chatId: BigInt(chatId), lastMessageId },
        update: { lastMessageId },
    });
}

/**
 * Where the first run for a chat (no watermark yet) starts: just before the Nth newest text message,
 * or 0 when the chat has fewer than N.
 */
export async function backfillStart(chatId: string, count: number): Promise<number> {
    const rows = await Database.instance().messages.findMany({
        where: { chatId: Number(chatId), type: "text", role: { in: EXTRACTABLE_ROLES } },
        select: { id: true },
        orderBy: { id: "desc" },
        skip: count - 1,
        take: 1,
    });

    return rows.length > 0 ? rows[0].id - 1 : 0;
}

/** The next `size` text messages after `after`, oldest first. */
export async function nextChunk(chatId: string, after: number, size: number): Promise<MemoryMessage[]> {
    return Database.instance().messages.findMany({
        where: { chatId: Number(chatId), type: "text", role: { in: EXTRACTABLE_ROLES }, id: { gt: after } },
        select: { id: true, role: true, content: true },
        orderBy: { id: "asc" },
        take: size,
    });
}

/** Chats with text messages newer than their watermark, or with no watermark yet (backfill). */
export async function chatsWithNewMessages(): Promise<string[]> {
    const db = Database.instance();

    const latest = await db.messages.groupBy({
        by: ["chatId"],
        where: { type: "text", role: { in: EXTRACTABLE_ROLES } },
        _max: { id: true },
    });

    const states = await db.memoryExtractionState.findMany({ select: { chatId: true, lastMessageId: true } });
    const watermarks = new Map(states.map((state) => [String(state.chatId), state.lastMessageId]));

    return latest
        .filter((entry) => {
            const watermark = watermarks.get(String(entry.chatId));
            return entry._max.id !== null && (watermark === undefined || entry._max.id > watermark);
        })
        .map((entry) => String(entry.chatId));
}
