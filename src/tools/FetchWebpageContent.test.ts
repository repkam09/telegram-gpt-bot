import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("../provider", () => ({
    resolveModelProvider: vi.fn(async () => ({ invoke })),
}));

import { answerFromContent, truncateContent } from "./FetchWebpageContent";

const WORKFLOW_ID = JSON.stringify({ platform: "legacy", chatId: "0", type: "legacy" });
const reply = (payload: string) => ({ __type: "string", payload });
const promptOf = (call: number): string => invoke.mock.calls[call][1][0].content;

beforeEach(() => {
    invoke.mockReset();
});

describe("truncateContent", () => {
    it("returns short content unchanged", () => {
        expect(truncateContent("hello", 10)).toBe("hello");
    });

    it("cuts long content and says how much was shown", () => {
        const result = truncateContent("a".repeat(50), 10);
        expect(result.startsWith("a".repeat(10))).toBe(true);
        expect(result).toContain("showing the first 10 of 50 characters");
    });
});

describe("answerFromContent", () => {
    it("answers a short page with a single model call", async () => {
        invoke.mockResolvedValueOnce(reply("  The answer.  "));

        const answer = await answerFromContent(WORKFLOW_ID, "page text", "what is it?");

        expect(answer).toBe("The answer.");
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(promptOf(0)).toContain("<question>what is it?</question>");
        expect(promptOf(0)).toContain("page text");
    });

    it("reads long pages in chunks, drops irrelevant ones, then combines the notes", async () => {
        // Three chunks of 32000 characters: relevant, irrelevant, relevant.
        const content = "a".repeat(32000) + "b".repeat(32000) + "c".repeat(100);
        invoke
            .mockResolvedValueOnce(reply("note one"))
            .mockResolvedValueOnce(reply("NONE"))
            .mockResolvedValueOnce(reply("note three"))
            .mockResolvedValueOnce(reply("final answer"));

        const answer = await answerFromContent(WORKFLOW_ID, content, "q");

        expect(answer).toBe("final answer");
        expect(invoke).toHaveBeenCalledTimes(4);
        expect(promptOf(3)).toContain("note one");
        expect(promptOf(3)).toContain("note three");
        expect(promptOf(3)).not.toContain("NONE");
    });

    it("limits how many chunks of a very long page are read", async () => {
        invoke.mockResolvedValue(reply("note"));

        await answerFromContent(WORKFLOW_ID, "x".repeat(32000 * 20), "q");

        // 8 chunk calls plus the final combining call.
        expect(invoke).toHaveBeenCalledTimes(9);
    });

    it("returns null when the model call fails", async () => {
        invoke.mockRejectedValueOnce(new Error("litellm down"));

        await expect(answerFromContent(WORKFLOW_ID, "page text", "q")).resolves.toBeNull();
    });

    it("returns null when the model returns no text", async () => {
        invoke.mockResolvedValueOnce({ __type: "tool", payload: [] });

        await expect(answerFromContent(WORKFLOW_ID, "page text", "q")).resolves.toBeNull();
    });
});
