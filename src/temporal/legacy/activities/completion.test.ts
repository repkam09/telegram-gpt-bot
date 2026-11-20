import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockActivityEnvironment } from "@temporalio/testing";
import { prependToLatestUserMessage, legacyCompletion, legacyCompletionPromptTemplate, loadCompletionContextImage } from "./completion";
import { createWorkflowId } from "../interface";
import { MemoryFileStore } from "../../../tools/memory/MemoryFileStore";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../../tests/helpers/database";
import type { LegacyAgenticResponse } from "../types";
import type { PromptComplexityResult } from "./classifier";

const modelCompletion = vi.fn();
const modelLimit = vi.fn();
const availableTools = vi.fn();

vi.mock("../../../provider", () => ({
    resolveModelProvider: vi.fn(async () => ({ limit: modelLimit, completion: modelCompletion })),
}));

vi.mock("../tools", () => ({
    availableTools: (...args: unknown[]) => availableTools(...args),
}));

const classification: PromptComplexityResult = { complexity: "complex", contextLimit: 100, useTools: true, modelTier: "high" };

describe("legacyCompletion", () => {
    let testDb: TestDatabase;
    let scratch: string;
    const workflowId = createWorkflowId("test", String(TEST_CHAT_ID));

    beforeAll(async () => {
        testDb = await createTestDatabase();
        scratch = mkdtempSync(path.join(tmpdir(), "hennos-completion-test-"));
    });

    afterAll(async () => {
        await testDb?.cleanup();
        rmSync(scratch, { recursive: true, force: true });
    });

    beforeEach(async () => {
        await testDb.reset();
        modelCompletion.mockReset().mockResolvedValue({ __type: "string", payload: "model reply" });
        modelLimit.mockReset().mockReturnValue(100000);
        availableTools.mockReset().mockReturnValue(undefined);
    });

    function complete(input: { context?: never[] | object[]; iterations?: number; classification?: PromptComplexityResult } = {}): Promise<LegacyAgenticResponse> {
        const env = new MockActivityEnvironment({ workflowExecution: { workflowId, runId: "run" } });
        return env.run(legacyCompletion, {
            context: [],
            iterations: 0,
            classification,
            ...input,
        } as Parameters<typeof legacyCompletion>[0]) as Promise<LegacyAgenticResponse>;
    }

    async function say(role: "user" | "assistant", content: string, chatId = TEST_CHAT_ID) {
        await testDb.db.messages.create({ data: { chatId, role, content } });
    }

    function sentPrompt(): { role: string; content?: string }[] {
        return modelCompletion.mock.calls[0][1];
    }

    it("sends the system prompt, stored history (oldest first) and in-flight tool context to the model", async () => {
        await say("user", "first");
        await say("assistant", "second");
        await say("user", "third");
        const toolContext = [{ role: "tool_call", id: "c1", name: "weather", input: {} }, { role: "tool_response", id: "c1", result: "sunny" }];

        await complete({ context: toolContext, iterations: 2 });

        const prompt = sentPrompt();
        expect(prompt[0].role).toBe("system");
        expect(prompt[0].content).toContain("Hennos");
        expect(prompt.slice(1, 4)).toEqual([
            { role: "user", content: "first" },
            { role: "assistant", content: "second" },
            { role: "user", content: "third" },
        ]);
        expect(prompt.slice(4)).toEqual(toolContext);
        expect(modelCompletion.mock.calls[0][0]).toBe(workflowId);
        expect(modelCompletion.mock.calls[0][2]).toBe(2);
    });

    it("only loads the most recent messages up to the classification's context limit", async () => {
        for (let i = 1; i <= 5; i++) {
            await say("user", `message ${i}`);
        }

        await complete({ classification: { ...classification, contextLimit: 3 } });

        expect(sentPrompt().slice(1).map((entry) => entry.content)).toEqual(["message 3", "message 4", "message 5"]);
    });

    it("does not include messages from other chats", async () => {
        await testDb.db.user.create({ data: { chatId: BigInt(42), firstName: "Other" } });
        await say("user", "mine");
        await say("user", "someone else's", 42);

        await complete();

        expect(sentPrompt().slice(1).map((entry) => entry.content)).toEqual(["mine"]);
    });

    it("passes tool definitions when tools are allowed, and none when they are not", async () => {
        const definition = { type: "function", function: { name: "weather" } };
        availableTools.mockReturnValue([{ definition: () => definition }]);

        await complete();
        expect(modelCompletion.mock.calls[0][3]).toEqual([definition]);

        modelCompletion.mockClear();
        await complete({ classification: { ...classification, useTools: false } });
        expect(modelCompletion.mock.calls[0][3]).toEqual([]);
    });

    it("returns text responses as strings", async () => {
        expect(await complete()).toEqual({ __type: "string", payload: "model reply" });
    });

    it("returns tool responses as actions", async () => {
        modelCompletion.mockResolvedValue({ __type: "tool", payload: [{ name: "weather", input: { city: "Rochester" }, id: "call-1" }] });

        expect(await complete()).toEqual({
            __type: "action",
            payload: [{ name: "weather", input: { city: "Rochester" }, id: "call-1" }],
        });
    });

    it("fails with InvalidModelResponse when the provider returns something unexpected", async () => {
        modelCompletion.mockResolvedValue({ __type: "mystery" });

        await expect(complete()).rejects.toMatchObject({ type: "InvalidModelResponse" });
    });

    it("drops the oldest messages when the history does not fit the model's context window", async () => {
        const filler = "lorem ".repeat(300);
        await say("user", `oldest ${filler}`);
        await say("assistant", `middle ${filler}`);
        await say("user", `newest ${filler}`);
        // Big enough for the system prompt plus roughly one message, but not all three.
        modelLimit.mockReturnValue(1100);

        await complete();

        const history = sentPrompt().slice(1).map((entry) => entry.content ?? "");
        expect(history.length).toBeGreaterThan(0);
        expect(history.length).toBeLessThan(3);
        expect(history[history.length - 1]).toContain("newest");
        expect(history.some((content) => content.startsWith("oldest"))).toBe(false);
    });

    it("fails when even the system prompt cannot fit in the context window", async () => {
        await say("user", "hello");
        modelLimit.mockReturnValue(1);

        await expect(complete()).rejects.toThrow(/Chat context cleanup failed/);
        expect(modelCompletion).not.toHaveBeenCalled();
    });

    it("includes stored images, base64 encoded, and skips images that are missing on disk", async () => {
        const imagePath = path.join(scratch, "cat.png");
        writeFileSync(imagePath, "ABC");
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", type: "image", content: JSON.stringify({ local: imagePath, mime: "image/png" }) } });
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", type: "image", content: JSON.stringify({ local: path.join(scratch, "missing.png"), mime: "image/png" }) } });
        await say("user", "what is this?");

        await complete();

        const prompt = sentPrompt() as unknown as { role: string; content?: string; image?: unknown; encoded?: unknown }[];
        expect(prompt).toHaveLength(3); // system + image + text; the missing image is dropped
        expect(prompt[1]).toEqual({ role: "user", image: { local: imagePath, mime: "image/png" }, encoded: { __type: "b64_image", data: "QUJD" } });
        expect(prompt[2].content).toBe("what is this?");
    });

    describe("memory", () => {
        const chatId = String(TEST_CHAT_ID);

        async function seedMemory() {
            const store = new MemoryFileStore(chatId);
            await store.create("/memories/profile.md", "---\nname: profile\ndescription: Who Sam is\n---\n- [stated] Name is Sam");
            await store.create("/memories/topics/tea.md", "---\nname: tea\ndescription: Sam's tea habits\n---\n- [stated] likes oolong");
        }

        async function sayMany(count: number): Promise<number[]> {
            const ids: number[] = [];
            for (let i = 0; i < count; i++) {
                const row = await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` } });
                ids.push(row.id);
            }
            return ids;
        }

        it("adds nothing about memory unless exposure is enabled", async () => {
            await seedMemory();

            await complete();

            const system = sentPrompt()[0].content!;
            expect(system).not.toContain("<memory>");
            expect(system).not.toContain("Name is Sam");
        });

        it("injects the core files and the index of the other files when enabled, without frontmatter", async () => {
            vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
            await seedMemory();

            await complete();

            const system = sentPrompt()[0].content!;
            expect(system).toContain("<memory>");
            expect(system).toContain("- [stated] Name is Sam");
            expect(system).not.toContain("description: Who Sam is");
            expect(system).toContain("- /memories/topics/tea.md: Sam's tea habits");
            expect(system).not.toContain("likes oolong");
            expect(system).toContain("it will be updated overnight");
        });

        it("adds no memory section when nothing is stored", async () => {
            vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");

            await complete();

            expect(sentPrompt()[0].content).not.toContain("<memory>");
        });

        it("keeps messages newer than the extraction watermark, with at least the last 15", async () => {
            vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
            const ids = await sayMany(40);
            await testDb.db.memoryExtractionState.create({ data: { chatId: BigInt(TEST_CHAT_ID), lastMessageId: ids[19] } });

            await complete();

            expect(sentPrompt().length - 1).toBe(20); // ids[20..39] are not extracted yet
        });

        it("never shrinks below 15 messages once everything is extracted", async () => {
            vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
            const ids = await sayMany(40);
            await testDb.db.memoryExtractionState.create({ data: { chatId: BigInt(TEST_CHAT_ID), lastMessageId: ids[39] } });

            await complete();

            expect(sentPrompt().length - 1).toBe(15);
        });

        it("keeps the full window when no extraction has ever run", async () => {
            vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
            await sayMany(120);

            await complete();

            expect(sentPrompt().length - 1).toBe(100);
        });

        it("puts selected memory files at the start of the latest user message, leaving the system prompt and history untouched", async () => {
            vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
            await seedMemory();
            await say("user", "first question");
            await say("assistant", "an answer");
            await say("user", "what tea should I get?");

            await complete({ classification: { ...classification, memoryFiles: ["/memories/topics/tea.md"] } });

            const prompt = sentPrompt();
            const latest = prompt[prompt.length - 1];
            expect(latest.role).toBe("user");
            expect(latest.content).toContain("<memory-files>");
            expect(latest.content).toContain("likes oolong");
            expect(latest.content!.endsWith("what tea should I get?")).toBe(true);
            expect(prompt.filter((entry) => entry.role === "system")).toHaveLength(1); // no extra system message
            expect(prompt[0].content).not.toContain("likes oolong");
            expect(prompt[1]).toEqual({ role: "user", content: "first question" });
            expect(prompt[2]).toEqual({ role: "assistant", content: "an answer" });
        });

        it("treats stored external context like a normal user message in the chat history", async () => {
            await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", type: "context", content: "<voice>...</voice>" } });
            await say("user", "hello");

            await complete();

            expect(sentPrompt().slice(1)).toEqual([{ role: "user", content: "<voice>...</voice>" }, { role: "user", content: "hello" }]);
        });

        it("ignores selected files when exposure is off", async () => {
            await seedMemory();
            await say("user", "what tea should I get?");

            await complete({ classification: { ...classification, memoryFiles: ["/memories/topics/tea.md"] } });

            expect(JSON.stringify(sentPrompt())).not.toContain("memory-files");
        });

        it("keeps the 100 message window when exposure is off, whatever the watermark", async () => {
            const ids = await sayMany(40);
            await testDb.db.memoryExtractionState.create({ data: { chatId: BigInt(TEST_CHAT_ID), lastMessageId: ids[39] } });

            await complete();

            expect(sentPrompt().length - 1).toBe(40);
        });
    });
});

describe("prependToLatestUserMessage", () => {
    it("prepends to the last user message only", () => {
        const context = [{ role: "user" as const, content: "a" }, { role: "assistant" as const, content: "b" }, { role: "user" as const, content: "c" }];

        prependToLatestUserMessage(context, "notes");

        expect(context.map((item) => (item as { content: string }).content)).toEqual(["a", "b", "notes\n\nc"]);
    });

    it("adds a user message when there is no text user message", () => {
        const context = [{ role: "assistant" as const, content: "b" }];

        prependToLatestUserMessage(context, "notes");

        expect(context).toEqual([{ role: "assistant", content: "b" }, { role: "user", content: "notes" }]);
    });
});

describe("legacyCompletionPromptTemplate", () => {
    const currentDate = new Date(2026, 10, 18, 12, 0, 0);

    it("states the current date and weekday", () => {
        const prompt = legacyCompletionPromptTemplate({ currentDate });

        expect(prompt).toContain("The current date is 2026-11-18");
        expect(prompt).toContain("It is a Wednesday today");
    });

    it("includes the memory section only when one is provided", () => {
        expect(legacyCompletionPromptTemplate({ currentDate })).not.toContain("<memory>");
        expect(legacyCompletionPromptTemplate({ currentDate, memoryContext: "<memory>notes</memory>" })).toContain("<memory>notes</memory>");
    });

    it("mentions how long it has been since the user was last active only when known", () => {
        expect(legacyCompletionPromptTemplate({ currentDate })).not.toContain("since the last message");
        expect(legacyCompletionPromptTemplate({ currentDate, lastActiveDate: new Date(currentDate.getTime() - 10 * 60 * 1000) })).toContain("since the last message from the user");
    });
});

describe("loadCompletionContextImage", () => {
    it("returns null for a file that does not exist", async () => {
        expect(await loadCompletionContextImage({ local: "/definitely/not/here.png", mime: "image/png" })).toBeNull();
    });
});
