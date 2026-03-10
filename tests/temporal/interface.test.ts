import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createWorkflowId, parseWorkflowId } from "../../src/temporal/agent/interface";
import { Database } from "../../src/database";

beforeAll(async () => {
    await Database.init();
});

afterAll(async () => {
    await Database.disconnect();
});

describe("Workflow ID serialization", () => {
    it("should be reversible for various chatId formats", () => {
        const testCases = [
            { platform: "telegram", chatId: "123" },
            { platform: "telegram", chatId: "-1001234567890" }, // Telegram group
            { platform: "discord", chatId: "987654321987654321" },
            { platform: "api", chatId: "custom-id-123" },
        ];

        testCases.forEach(async ({ platform, chatId }) => {
            const workflowId = await createWorkflowId(platform, chatId);
            const parsed = parseWorkflowId(workflowId);

            expect(parsed.platform).toBe(platform);
            expect(parsed.chatId).toBe(chatId);
        });
    });
});
