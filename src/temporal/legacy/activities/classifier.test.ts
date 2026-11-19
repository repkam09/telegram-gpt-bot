import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import { classifierPromptTemplate, classifierToolDefinitions, classifyPromptComplexity, decisionQuestion, PromptComplexityResult } from "./classifier";
import { createWorkflowId } from "../interface";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../../tests/helpers/database";

const invoke = vi.fn();

vi.mock("../../../provider", () => ({
    resolveModelProvider: vi.fn(async () => ({ invoke })),
}));

function toolResponse(name: string) {
    return { __type: "tool", payload: [{ name, input: {}, id: "id-1" }] };
}

describe("classifyPromptComplexity", () => {
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
        invoke.mockReset();
        // Classification only calls the LLM for providers that are not ollama / litellm.
        vi.stubEnv("HENNOS_LLM_PROVIDER", "openai");
    });

    function classify(input = { iterations: 0, hasToolContext: false }): Promise<PromptComplexityResult> {
        const env = new MockActivityEnvironment({ workflowExecution: { workflowId, runId: "run" } });
        return env.run(classifyPromptComplexity, input) as Promise<PromptComplexityResult>;
    }

    async function userSays(content: string) {
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", content } });
    }

    it("returns complex without calling the LLM when the classifier is disabled", async () => {
        vi.stubEnv("HENNOS_CLASSIFIER_ENABLED", "false");
        await userSays("hi");

        const result = await classify();

        expect(result).toEqual({ complexity: "complex", contextLimit: 100, useTools: true, modelTier: "high" });
        expect(invoke).not.toHaveBeenCalled();
    });

    it.each(["ollama", "litellm"])("skips classification for the %s provider", async (provider) => {
        vi.stubEnv("HENNOS_LLM_PROVIDER", provider);
        await userSays("hi");

        const result = await classify();

        expect(result.complexity).toBe("complex");
        expect(invoke).not.toHaveBeenCalled();
    });

    it("uses a smaller context window for complex prompts when memory is enabled", async () => {
        vi.stubEnv("HENNOS_CLASSIFIER_ENABLED", "false");
        vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");

        const result = await classify();

        expect(result).toMatchObject({ complexity: "complex", contextLimit: 15 });
    });

    it("skips the LLM while in a tool call loop", async () => {
        await userSays("what's the weather");

        expect((await classify({ iterations: 2, hasToolContext: true })).complexity).toBe("complex");
        expect((await classify({ iterations: 0, hasToolContext: true })).complexity).toBe("complex");
        expect(invoke).not.toHaveBeenCalled();
    });

    it("classifies an empty latest message as simple without calling the LLM", async () => {
        await userSays("   ");

        const result = await classify();

        expect(result).toEqual({ complexity: "simple", contextLimit: 10, useTools: true, modelTier: "low" });
        expect(invoke).not.toHaveBeenCalled();
    });

    it("classifies as simple when there are no user messages at all", async () => {
        expect((await classify()).complexity).toBe("simple");
    });

    it.each([
        ["classify_trivial", { complexity: "trivial", contextLimit: 5, modelTier: "nano" }],
        ["classify_simple", { complexity: "simple", contextLimit: 10, modelTier: "low" }],
        ["classify_complex", { complexity: "complex", contextLimit: 100, modelTier: "high" }],
    ])("maps the %s tool call to the matching tier", async (toolName, expected) => {
        await userSays("hello");
        invoke.mockResolvedValue(toolResponse(toolName));

        expect(await classify()).toMatchObject({ ...expected, useTools: true });
    });

    it("sends only the most recent user message to the classifier", async () => {
        await userSays("an older message");
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "assistant", content: "assistant reply" } });
        await userSays("the newest message");
        invoke.mockResolvedValue(toolResponse("classify_simple"));

        await classify();

        expect(invoke).toHaveBeenCalledTimes(1);
        const [id, messages, tools] = invoke.mock.calls[0];
        expect(id).toBe(workflowId);
        expect(messages[1]).toMatchObject({ role: "user", content: "the newest message" });
        expect(tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["classify_trivial", "classify_simple", "classify_complex"]);
    });

    it("falls back to complex for an unrecognised tool call", async () => {
        await userSays("hello");
        invoke.mockResolvedValue(toolResponse("something_else"));

        expect((await classify()).complexity).toBe("complex");
    });

    it("falls back to complex when the model answers with text", async () => {
        await userSays("hello");
        invoke.mockResolvedValue({ __type: "string", payload: "I think this is simple" });

        expect((await classify()).complexity).toBe("complex");
    });

    it("falls back to complex when the LLM call throws", async () => {
        await userSays("hello");
        invoke.mockRejectedValue(new Error("rate limited"));

        expect((await classify()).complexity).toBe("complex");
    });
});

describe("classifier definitions", () => {
    it("exposes one no-argument tool per complexity level", () => {
        const tools = classifierToolDefinitions();

        expect(tools.map((tool) => tool.function.name)).toEqual(["classify_trivial", "classify_simple", "classify_complex"]);
        for (const tool of tools) {
            expect(tool.function.parameters).toMatchObject({ type: "object", required: [] });
        }
    });

    it("passes the user message through unchanged as the user prompt", () => {
        const prompt = classifierPromptTemplate("what is 2+2?");

        expect(prompt.user).toBe("what is 2+2?");
        expect(prompt.system).toContain("classify_trivial");
        expect(prompt.system).toContain("classify_complex");
    });
});

describe("classifyPromptComplexity with a decision model", () => {
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
        invoke.mockReset();
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubEnv("HENNOS_LLM_PROVIDER", "litellm");
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

    function decisionResponse(choice: string, confidence = 0.95) {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                answers: [{ type: "choice", name: "complexity", choice, confidence, probabilities: [{ value: choice, probability: confidence }] }],
            }),
        };
    }

    it.each([
        ["trivial", { complexity: "trivial", contextLimit: 5, modelTier: "nano" }],
        ["simple", { complexity: "simple", contextLimit: 10, modelTier: "low" }],
        ["complex", { complexity: "complex", contextLimit: 100, modelTier: "high" }],
    ])("maps a '%s' decision to the matching tier, even on the litellm provider", async (choice, expected) => {
        await say("user", "hello");
        fetchMock.mockResolvedValue(decisionResponse(choice));

        expect(await classify()).toMatchObject({ ...expected, useTools: true });
        expect(invoke).not.toHaveBeenCalled();
    });

    it("posts the recent conversation and the complexity question to the normalised decisions endpoint", async () => {
        await say("user", "what's the capital of France?");
        await say("assistant", "Paris.");
        await say("user", "and Germany?");
        fetchMock.mockResolvedValue(decisionResponse("simple"));

        await classify();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://litellm.example.com/v1/decisions");
        expect(init.headers.authorization).toBe("Bearer sk-test");

        const body = JSON.parse(init.body);
        expect(body.model).toBe("jev");
        expect(body.input).toBe("user: what's the capital of France?\nassistant: Paris.\nuser: and Germany?");
        expect(body.questions).toEqual([{ type: "choice", ...decisionQuestion() }]);
    });

    it("falls back to complex when the confidence is below the minimum", async () => {
        await say("user", "hello");
        fetchMock.mockResolvedValue(decisionResponse("trivial", 0.4));

        expect((await classify()).complexity).toBe("complex");
    });

    it("honours a configured minimum confidence", async () => {
        vi.stubEnv("HENNOS_CLASSIFIER_MIN_CONFIDENCE", "0.3");
        await say("user", "hello");
        fetchMock.mockResolvedValue(decisionResponse("trivial", 0.4));

        expect((await classify()).complexity).toBe("trivial");
    });

    it.each([
        ["an HTTP error", () => ({ ok: false, status: 503, json: async () => ({}) })],
        ["a malformed body", () => ({ ok: true, status: 200, json: async () => ({ nope: true }) })],
        ["a choice outside the set", () => decisionResponse("bogus")],
        ["a refusal", () => ({ ok: true, status: 200, json: async () => ({ answers: [{ type: "refusal", name: "complexity" }] }) })],
    ])("falls back to complex on %s", async (_label, response) => {
        await say("user", "hello");
        fetchMock.mockResolvedValue(response());

        expect((await classify()).complexity).toBe("complex");
    });

    it("falls back to complex when the request throws", async () => {
        await say("user", "hello");
        fetchMock.mockRejectedValue(new Error("timeout"));

        expect((await classify()).complexity).toBe("complex");
    });

    it("does not call the decision model in a tool call loop or when the classifier is disabled", async () => {
        await say("user", "hello");

        await classify({ iterations: 1, hasToolContext: true });
        vi.stubEnv("HENNOS_CLASSIFIER_ENABLED", "false");
        await classify();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
