import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWorkflowId, parseWorkflowId, signalLegacyWorkflowExternalContext, signalLegacyWorkflowImageMessage } from "./interface";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../tests/helpers/database";

describe("workflow IDs", () => {
    it("round-trips platform and chatId", () => {
        const id = createWorkflowId("telegram", "12345");

        expect(parseWorkflowId(id)).toEqual({ platform: "telegram", chatId: "12345", type: "legacy" });
    });

    it("accepts negative chat IDs (Telegram group chats)", () => {
        expect(parseWorkflowId(createWorkflowId("telegram", "-100123")).chatId).toBe("-100123");
    });

    it("refuses to create an ID for a non-numeric chatId", () => {
        expect(() => createWorkflowId("telegram", "abc")).toThrow(/must be a number/);
    });

    it("refuses to parse IDs without the legacy type", () => {
        expect(() => parseWorkflowId(JSON.stringify({ platform: "telegram", chatId: "1", type: "agent" }))).toThrow(/Invalid workflowId/);
    });

    it("refuses to parse IDs missing a platform or chatId", () => {
        expect(() => parseWorkflowId(JSON.stringify({ chatId: "1", type: "legacy" }))).toThrow(/Invalid workflowId/);
        expect(() => parseWorkflowId(JSON.stringify({ platform: "telegram", type: "legacy" }))).toThrow(/Invalid workflowId/);
    });

    it("refuses to parse IDs with a non-numeric chatId", () => {
        expect(() => parseWorkflowId(JSON.stringify({ platform: "telegram", chatId: "abc", type: "legacy" }))).toThrow(/must be a number/);
    });

    it("throws for IDs that are not JSON", () => {
        expect(() => parseWorkflowId("not json")).toThrow();
    });
});

describe("database-backed signal helpers", () => {
    let testDb: TestDatabase;
    const workflowId = createWorkflowId("test", String(TEST_CHAT_ID));

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
    });

    it("stores external context as a user message of type context", async () => {
        await signalLegacyWorkflowExternalContext(workflowId, "Some Author", "extra context");

        const rows = await testDb.db.messages.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ chatId: BigInt(TEST_CHAT_ID), role: "user", type: "context", content: "extra context" });
    });

    it("stores image messages with their local path and mime type", async () => {
        await signalLegacyWorkflowImageMessage(workflowId, "Some Author", "/tmp/cat.png", "image/png");

        const rows = await testDb.db.messages.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ role: "user", type: "image" });
        expect(JSON.parse(rows[0].content)).toEqual({ local: "/tmp/cat.png", mime: "image/png" });
    });

    it("rejects an invalid workflow ID without writing anything", async () => {
        await expect(signalLegacyWorkflowExternalContext("garbage", "a", "b")).rejects.toThrow();
        expect(await testDb.db.messages.count()).toBe(0);
    });
});
