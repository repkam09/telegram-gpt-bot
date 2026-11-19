import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import { classifierPromptTemplate, classifierToolDefinitions, classifyPromptComplexity, PromptComplexityResult } from "./classifier";
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
