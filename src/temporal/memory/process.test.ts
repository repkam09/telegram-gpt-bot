import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { processChat } from "./process";
import { chatsWithNewMessages, getWatermark, setWatermark } from "./state";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../tests/helpers/database";
import type { MemoryGateDecision } from "./gate";

const runGate = vi.fn();
const extractMemories = vi.fn();

vi.mock("./gate", () => ({
    runGate: (...args: unknown[]) => runGate(...args),
}));

vi.mock("./extract", () => ({
    extractMemories: (...args: unknown[]) => extractMemories(...args),
}));

const chatId = String(TEST_CHAT_ID);
const OTHER_CHAT = 7;

const decision = (extract: boolean): MemoryGateDecision => ({
    extract,
    reason: extract ? "durable_or_update" : "nothing_durable",
    signals: { durable_fact: extract ? 0.9 : 0, update: 0, explicit: 0, forget: 0, secret: 0 },
});

describe("memory chat processing", () => {
    let testDb: TestDatabase;

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
        runGate.mockReset().mockResolvedValue(decision(true));
        extractMemories.mockReset().mockResolvedValue({ iterations: 1, changes: [{ command: "create", path: "/memories/profile.md" }], summary: "ok", capped: false });
        vi.stubEnv("HENNOS_MEMORY_CHUNK_MESSAGES", "2");
        vi.stubEnv("HENNOS_MEMORY_BACKFILL_MESSAGES", "200");
        vi.stubEnv("HENNOS_MEMORY_MAX_CHUNKS", "8");
    });

    /** Seeds alternating user/assistant text messages and returns their ids. */
    async function seed(count: number, chat = TEST_CHAT_ID): Promise<number[]> {
        const ids: number[] = [];
        for (let i = 0; i < count; i++) {
            const row = await testDb.db.messages.create({ data: { chatId: chat, role: i % 2 === 0 ? "user" : "assistant", content: `message ${i}` } });
            ids.push(row.id);
        }
        return ids;
    }

    it("processes new messages oldest first in chunks and advances the watermark per chunk", async () => {
        const ids = await seed(5);
        await setWatermark(chatId, ids[0] - 1);

        const result = await processChat(chatId);

        expect(result.stopped).toBe("done");
        expect(result.chunks.map((chunk) => chunk.messages)).toEqual([2, 2, 1]);
        const gated = runGate.mock.calls.map((call) => (call[0] as { id: number }[]).map((message) => message.id));
        expect(gated).toEqual([[ids[0], ids[1]], [ids[2], ids[3]], [ids[4]]]);
        expect(await getWatermark(chatId)).toBe(ids[4]);
    });

    it("backfills only the last N messages on the first run", async () => {
        vi.stubEnv("HENNOS_MEMORY_BACKFILL_MESSAGES", "3");
        const ids = await seed(6);

        await processChat(chatId);

        const seen = extractMemories.mock.calls.flatMap((call) => (call[2] as { id: number }[]).map((message) => message.id));
        expect(seen).toEqual(ids.slice(3));
        expect(await getWatermark(chatId)).toBe(ids[5]);
    });

    it("advances the watermark without extracting when the gate says no", async () => {
        const ids = await seed(2);
        runGate.mockResolvedValue(decision(false));

        const result = await processChat(chatId);

        expect(extractMemories).not.toHaveBeenCalled();
        expect(result.chunks[0].gate.extract).toBe(false);
        expect(await getWatermark(chatId)).toBe(ids[1]);
    });

    it("stops on a gate error and keeps the progress of earlier chunks", async () => {
        const ids = await seed(4);
        runGate.mockResolvedValueOnce(decision(true)).mockRejectedValueOnce(new Error("decisions API down"));

        const result = await processChat(chatId);

        expect(result).toMatchObject({ stopped: "error", error: "decisions API down" });
        expect(result.chunks).toHaveLength(1);
        expect(await getWatermark(chatId)).toBe(ids[1]);
    });

    it("keeps the watermark when the extraction fails", async () => {
        await seed(2);
        extractMemories.mockRejectedValue(new Error("LiteLLM down"));

        const result = await processChat(chatId);

        expect(result.stopped).toBe("error");
        expect(await getWatermark(chatId)).toBeNull();
    });

    it("stops at the per-run chunk cap and continues from there next time", async () => {
        vi.stubEnv("HENNOS_MEMORY_MAX_CHUNKS", "1");
        const ids = await seed(5);

        const first = await processChat(chatId);
        expect(first.stopped).toBe("chunk_cap");
        expect(await getWatermark(chatId)).toBe(ids[1]);

        const second = await processChat(chatId);
        expect(second.stopped).toBe("chunk_cap");
        expect(await getWatermark(chatId)).toBe(ids[3]);
    });

    it("ignores image messages and other roles", async () => {
        const ids = await seed(2);
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", type: "image", content: "{}" } });
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "system", content: "context" } });

        await processChat(chatId);

        const seen = extractMemories.mock.calls.flatMap((call) => (call[2] as { id: number }[]).map((message) => message.id));
        expect(seen).toEqual(ids);
    });

    it("ignores injected external context (type context) so it is never extracted as the user's words", async () => {
        const ids = await seed(2);
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", type: "context", content: "<hennos_feedback>another user's details</hennos_feedback>" } });

        await processChat(chatId);

        const seen = extractMemories.mock.calls.flatMap((call) => (call[2] as { id: number; content: string }[]));
        expect(seen.map((message) => message.id)).toEqual(ids);
        expect(JSON.stringify(seen)).not.toContain("hennos_feedback");
    });

    it("does not list a chat that only has external context", async () => {
        await testDb.db.messages.create({ data: { chatId: OTHER_CHAT, role: "user", type: "context", content: "digest" } });

        expect(await chatsWithNewMessages()).toEqual([]);
    });

    it("records when an extraction hit its iteration cap and still advances the watermark", async () => {
        const ids = await seed(2);
        extractMemories.mockResolvedValue({ iterations: 12, changes: [], summary: "iteration cap reached", capped: true });

        const result = await processChat(chatId);

        expect(result.chunks[0].capped).toBe(true);
        expect(await getWatermark(chatId)).toBe(ids[1]);
    });

    it("lists only chats with text messages newer than their watermark, plus chats never processed", async () => {
        const caughtUp = await seed(2);
        await setWatermark(chatId, caughtUp[1]);
        expect(await chatsWithNewMessages()).toEqual([]);

        await seed(1);
        await seed(2, OTHER_CHAT); // never processed
        await testDb.db.messages.create({ data: { chatId: 99, role: "user", type: "image", content: "{}" } });

        expect((await chatsWithNewMessages()).sort()).toEqual([chatId, String(OTHER_CHAT)].sort());
    });
});
