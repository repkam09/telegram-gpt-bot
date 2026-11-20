import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { extractMemories, MAX_EXTRACTION_ITERATIONS } from "./extract";
import { MemoryFileStore } from "../../tools/memory/MemoryFileStore";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../tests/helpers/database";

const completion = vi.fn();
const resolveModelProvider = vi.fn();

vi.mock("../../provider", () => ({
    resolveModelProvider: (...args: unknown[]) => resolveModelProvider(...args),
}));

const chatId = String(TEST_CHAT_ID);
const messages = [{ id: 1, role: "user", content: "My name is Sam and I live in Buffalo" }];

function toolCall(id: string, input: Record<string, unknown>, name = "memory") {
    return { __type: "tool" as const, payload: [{ name, input, id }] };
}

describe("extractMemories", () => {
    let testDb: TestDatabase;

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
        completion.mockReset();
        resolveModelProvider.mockReset().mockResolvedValue({ completion });
    });

    it("runs on the low tier with only the memory tool and the transcript", async () => {
        completion.mockResolvedValue({ __type: "string", payload: "no changes" });

        const result = await extractMemories("wf", chatId, messages);

        expect(resolveModelProvider).toHaveBeenCalledWith("wf", "low");
        const [, context, iteration, tools] = completion.mock.calls[0];
        expect(iteration).toBe(0);
        expect(tools).toHaveLength(1);
        expect(tools[0].function.name).toBe("memory");
        expect(context[0].role).toBe("system");
        expect(context[1].content).toContain("My name is Sam");
        expect(result).toEqual({ iterations: 1, changes: [], summary: "no changes", capped: false });
    });

    it("writes through the real memory store and reports only successful changes", async () => {
        completion
            .mockResolvedValueOnce(toolCall("1", { command: "view", path: "/memories" }))
            .mockResolvedValueOnce(toolCall("2", { command: "create", path: "/memories/profile.md", file_text: "---\nname: profile\ndescription: Who Sam is\n---\n- [stated] Name is Sam, lives in Buffalo" }))
            .mockResolvedValueOnce(toolCall("3", { command: "str_replace", path: "/memories/missing.md", old_str: "a", new_str: "b" }))
            .mockResolvedValueOnce({ __type: "string", payload: "filed profile" });

        const result = await extractMemories("wf", chatId, messages);

        expect(result.changes).toEqual([{ command: "create", path: "/memories/profile.md" }]);
        expect(await new MemoryFileStore(chatId).view("/memories/profile.md")).toContain("lives in Buffalo");
    });

    it("feeds tool results back to the model", async () => {
        completion
            .mockResolvedValueOnce(toolCall("1", { command: "view", path: "/memories" }))
            .mockResolvedValueOnce({ __type: "string", payload: "done" });

        await extractMemories("wf", chatId, messages);

        const second = completion.mock.calls[1][1];
        expect(second.at(-2)).toMatchObject({ role: "tool_call", id: "1", name: "memory" });
        expect(second.at(-1)).toMatchObject({ role: "tool_response", id: "1" });
    });

    it("answers any other tool name with an error instead of running it", async () => {
        completion
            .mockResolvedValueOnce(toolCall("1", { command: "view" }, "python_sandbox"))
            .mockResolvedValueOnce({ __type: "string", payload: "done" });

        const result = await extractMemories("wf", chatId, messages);

        expect(result.changes).toEqual([]);
        expect(completion.mock.calls[1][1].at(-1).result).toContain("Unknown tool");
    });

    it("can remove a line with str_replace and leaves no remnant", async () => {
        const store = new MemoryFileStore(chatId);
        await store.create("/memories/topics/food.md", "---\nname: food\ndescription: Food\n---\n- [stated] likes tea\n- [stated] drinks coffee");
        completion
            .mockResolvedValueOnce(toolCall("1", { command: "str_replace", path: "/memories/topics/food.md", old_str: "\n- [stated] drinks coffee", new_str: "" }))
            .mockResolvedValueOnce({ __type: "string", payload: "removed" });

        await extractMemories("wf", chatId, [{ id: 2, role: "user", content: "forget that I drink coffee" }]);

        const content = await store.view("/memories/topics/food.md");
        expect(content).toContain("likes tea");
        expect(content).not.toContain("coffee");
    });

    it("stops at the iteration cap", async () => {
        completion.mockResolvedValue(toolCall("x", { command: "view", path: "/memories" }));

        const result = await extractMemories("wf", chatId, messages);

        expect(completion).toHaveBeenCalledTimes(MAX_EXTRACTION_ITERATIONS);
        expect(result.summary).toBe("iteration cap reached");
        expect(result.capped).toBe(true);
    });

    it("propagates provider errors so the watermark is kept", async () => {
        completion.mockRejectedValue(new Error("LiteLLM down"));

        await expect(extractMemories("wf", chatId, messages)).rejects.toThrow("LiteLLM down");
    });
});
