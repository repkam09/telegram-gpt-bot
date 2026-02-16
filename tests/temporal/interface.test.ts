import { describe, it, expect } from "vitest";
import { createWorkflowId, parseWorkflowId } from "../../src/temporal/agent/interface";

describe("Workflow ID serialization", () => {
    it("should be reversible for various chatId formats", () => {
        const testCases = [
            { platform: "telegram", chatId: "123" },
            { platform: "telegram", chatId: "-1001234567890" }, // Telegram group
            { platform: "discord", chatId: "987654321987654321" },
            { platform: "api", chatId: "custom-id-123" },
        ];

        testCases.forEach(({ platform, chatId }) => {
            const workflowId = createWorkflowId(platform, chatId);
            const parsed = parseWorkflowId(workflowId);

            expect(parsed.platform).toBe(platform);
            expect(parsed.chatId).toBe(chatId);
        });
    });
});
