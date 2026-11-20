import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import { chooseTier, classifyPromptComplexity, DECISION_QUESTIONS, PromptComplexityResult, PromptSignals, resetClassifierState } from "./classifier";
import { createWorkflowId } from "../interface";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../../tests/helpers/database";

const signals = (overrides: Partial<PromptSignals> = {}): PromptSignals => ({ deep: 0, context: 0, casual: 0, lookup: 0, ...overrides });

describe("chooseTier", () => {
    it("routes anything with a hint of depth or context to the high tier, sticky", () => {
        expect(chooseTier(signals({ deep: 0.3, lookup: 0.9 }))).toEqual({ tier: "complex", sticky: true });
        expect(chooseTier(signals({ context: 0.6, casual: 0.9 }))).toEqual({ tier: "complex", sticky: true });
    });

    it("only routes to nano when it is clearly small talk", () => {
        expect(chooseTier(signals({ casual: 0.95, deep: 0.05, context: 0.1 })).tier).toBe("trivial");
        expect(chooseTier(signals({ casual: 0.8 })).tier).toBe("complex");
        expect(chooseTier(signals({ casual: 0.95, deep: 0.2 })).tier).toBe("complex");
        expect(chooseTier(signals({ casual: 0.95, context: 0.4 })).tier).toBe("complex");
    });

    it("only routes to the low tier for a confident self-contained lookup", () => {
        expect(chooseTier(signals({ lookup: 0.8, deep: 0.1 })).tier).toBe("simple");
        expect(chooseTier(signals({ lookup: 0.6 })).tier).toBe("complex");
    });

    it("defaults to the high tier when nothing is confident, without becoming sticky", () => {
        expect(chooseTier(signals())).toEqual({ tier: "complex", sticky: false });
    });
});

describe("classifyPromptComplexity", () => {
    let testDb: TestDatabase;
    const workflowId = createWorkflowId("test", String(TEST_CHAT_ID));
    const fetchMock = vi.fn();

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
        resetClassifierState();
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubEnv("HENNOS_CLASSIFIER_DECISION_MODEL", "jev");
        vi.stubEnv("LITELLM_BASE_URL", "https://litellm.example.com/v1/");
        vi.stubEnv("LITELLM_API_KEY", "sk-test");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function classify(input = { iterations: 0, hasToolContext: false }): Promise<PromptComplexityResult> {
        const env = new MockActivityEnvironment({ workflowExecution: { workflowId, runId: "run" } });
        return env.run(classifyPromptComplexity, input) as Promise<PromptComplexityResult>;
    }

    async function say(role: "user" | "assistant", content: string) {
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role, content } });
    }

    function answer(overrides: Partial<PromptSignals>) {
        const all = signals(overrides);
        return {
            ok: true,
            status: 200,
            json: async () => ({ answers: Object.entries(all).map(([name, probability]) => ({ type: "predicate", name, probability })) }),
        };
    }

    it("always uses the high tier without calling anything when no decision model is configured", async () => {
        vi.stubEnv("HENNOS_CLASSIFIER_DECISION_MODEL", "");
        await say("user", "hi");

        expect(await classify()).toEqual({ complexity: "complex", contextLimit: 100, useTools: true, modelTier: "high" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps contextLimit at 100 when memory exposure is enabled (the extraction-aware window is applied at completion time)", async () => {
        vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
        await say("user", "thanks!");
        fetchMock.mockResolvedValue(answer({ casual: 0.99 }));

        expect(await classify()).toEqual({ complexity: "trivial", contextLimit: 100, useTools: true, modelTier: "nano" });
    });

    it.each([
        ["small talk", { casual: 0.99 }, "nano"],
        ["a quick lookup", { lookup: 0.95 }, "low"],
        ["creative writing", { deep: 0.8, context: 0.7 }, "high"],
    ])("routes %s to the %s tier with the same context window and tools", async (_label, overrides, tier) => {
        await say("user", "some message");
        fetchMock.mockResolvedValue(answer(overrides));

        expect(await classify()).toMatchObject({ modelTier: tier, contextLimit: 100, useTools: true });
    });

    it("sends the recent conversation, with the latest message marked, and all four questions", async () => {
        await say("user", "can you tighten chapter three?");
        await say("assistant", "Sure, here is a tighter version.");
        await say("user", "make it punchier");
        fetchMock.mockResolvedValue(answer({ deep: 0.9 }));

        await classify();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://litellm.example.com/v1/decisions");
        const body = JSON.parse(init.body);
        expect(body.model).toBe("jev");
        expect(body.input).toBe("Recent conversation:\nuser: can you tighten chapter three?\nassistant: Sure, here is a tighter version.\n\nLatest user message:\nmake it punchier");
        expect(body.questions.map((q: { name: string }) => q.name)).toEqual(DECISION_QUESTIONS.map((q) => q.name));
    });

    it("sends long messages to the high tier without asking the decision model", async () => {
        await say("user", "x".repeat(900));

        expect(await classify()).toMatchObject({ modelTier: "high" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uses the high tier when there is no text message to classify", async () => {
        expect(await classify()).toMatchObject({ modelTier: "high" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ["an HTTP error", () => ({ ok: false, status: 503, json: async () => ({}) })],
        ["a malformed body", () => ({ ok: true, status: 200, json: async () => ({}) })],
    ])("falls back to the high tier on %s", async (_label, response) => {
        await say("user", "thanks!");
        fetchMock.mockResolvedValue(response());

        expect(await classify()).toMatchObject({ modelTier: "high" });
    });

    it("falls back to the high tier when the request throws", async () => {
        await say("user", "thanks!");
        fetchMock.mockRejectedValue(new Error("timeout"));

        expect(await classify()).toMatchObject({ modelTier: "high" });
    });

    it("keeps the model chosen for the turn while tools are running", async () => {
        await say("user", "what is the capital of France?");
        fetchMock.mockResolvedValue(answer({ lookup: 0.95 }));
        expect(await classify()).toMatchObject({ modelTier: "low" });
        fetchMock.mockClear();

        expect(await classify({ iterations: 1, hasToolContext: true })).toMatchObject({ modelTier: "low" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uses the high tier during a tool loop when nothing was decided yet", async () => {
        expect(await classify({ iterations: 1, hasToolContext: true })).toMatchObject({ modelTier: "high" });
    });

    describe("stickiness", () => {
        it("stays on the high tier after a deep turn, even for small talk", async () => {
            await say("user", "help me rework the opening of my novel");
            fetchMock.mockResolvedValue(answer({ deep: 0.9 }));
            expect(await classify()).toMatchObject({ modelTier: "high" });

            await say("user", "thanks!");
            fetchMock.mockResolvedValue(answer({ casual: 0.99 }));
            expect(await classify()).toMatchObject({ modelTier: "high" });
        });

        it("lets go of the high tier once the sticky turns run out", async () => {
            await say("user", "help me rework the opening of my novel");
            fetchMock.mockResolvedValue(answer({ deep: 0.9 }));
            await classify();

            fetchMock.mockResolvedValue(answer({ casual: 0.99 }));
            for (let turn = 0; turn < 8; turn++) {
                await say("user", `thanks ${turn}`);
                await classify();
            }

            await say("user", "thanks again");
            expect(await classify()).toMatchObject({ modelTier: "nano" });
        });

        it("does not start sticky from a plain lookup", async () => {
            await say("user", "what is 2+2?");
            fetchMock.mockResolvedValue(answer({ lookup: 0.95 }));
            expect(await classify()).toMatchObject({ modelTier: "low" });

            await say("user", "thanks!");
            fetchMock.mockResolvedValue(answer({ casual: 0.99 }));
            expect(await classify()).toMatchObject({ modelTier: "nano" });
        });
    });
});
