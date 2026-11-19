import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { ApplicationFailure } from "@temporalio/activity";
import { WorkflowHandle } from "@temporalio/client";
import { legacyWorkflow, legacyWorkflowMessageSignal } from "./workflow";
import { persistLegacyAgentMessage, persistLegacyUserMessage, broadcastLegacyAgentMessage } from "./activities/persist";
import { AgentResponseHandler } from "../../response";
import { createWorkflowId } from "./interface";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../tests/helpers/database";
import { waitFor } from "../../../tests/helpers/wait";
import type { LegacyAgenticResponse } from "./types";
import type { PromptComplexityResult } from "./activities/classifier";

const PLATFORM = "workflow-test";

const classification: PromptComplexityResult = {
    complexity: "simple",
    contextLimit: 10,
    useTools: true,
    modelTier: "low",
};

// The LLM-facing and tool-facing activities are replaced with mocks. The persistence and broadcast
// activities are the real implementations running against the ephemeral test database.
const classifyPromptComplexity = vi.fn();
const legacyCompletion = vi.fn();
const legacyAction = vi.fn();

describe("legacyWorkflow", () => {
    let testEnvironment: TestWorkflowEnvironment;
    let testDb: TestDatabase;
    let queueCounter = 0;
    let broadcasts: string[];

    beforeAll(async () => {
        testEnvironment = await TestWorkflowEnvironment.createTimeSkipping();
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testEnvironment?.teardown();
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
        classifyPromptComplexity.mockReset().mockResolvedValue(classification);
        legacyCompletion.mockReset();
        legacyAction.mockReset();

        broadcasts = [];
        AgentResponseHandler.registerMessageListener(PLATFORM, async (message) => {
            broadcasts.push(message);
        });

        return () => {
            AgentResponseHandler.unregisterMessageListener(PLATFORM);
        };
    });

    function createWorker() {
        return Worker.create({
            connection: testEnvironment.nativeConnection,
            taskQueue: `legacy-workflow-test-${++queueCounter}`,
            workflowsPath: require.resolve("./workflow.ts"),
            activities: {
                classifyPromptComplexity,
                legacyCompletion,
                legacyAction,
                persistLegacyAgentMessage,
                persistLegacyUserMessage,
                broadcastLegacyAgentMessage,
            },
        });
    }

    async function startWorkflow(worker: Awaited<ReturnType<typeof createWorker>>): Promise<WorkflowHandle<typeof legacyWorkflow>> {
        return testEnvironment.client.workflow.start(legacyWorkflow, {
            taskQueue: worker.options.taskQueue,
            workflowId: createWorkflowId(PLATFORM, String(TEST_CHAT_ID)),
            args: [{}],
        });
    }

    async function sendMessage(handle: WorkflowHandle<typeof legacyWorkflow>, message: string, author = "Test User") {
        await handle.signal(legacyWorkflowMessageSignal, message, author, new Date().toISOString());
    }

    function text(payload: string): LegacyAgenticResponse {
        return { __type: "string", payload };
    }

    function action(...calls: { name: string; input: Record<string, string>; id: string }[]): LegacyAgenticResponse {
        return { __type: "action", payload: calls };
    }

    async function storedMessages() {
        return testDb.db.messages.findMany({ where: { chatId: TEST_CHAT_ID }, orderBy: { id: "asc" } });
    }

    it("persists the user message, then persists and broadcasts the agent's reply", async () => {
        legacyCompletion.mockResolvedValue(text("Hello from the agent"));
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "Hi there");

            await waitFor(() => broadcasts.length === 1, { description: "the agent reply to be broadcast" });
            await handle.terminate("test complete");
        });

        expect(broadcasts).toEqual(["Hello from the agent"]);

        const rows = await storedMessages();
        expect(rows.map((row) => [row.role, row.content])).toEqual([
            ["user", "Hi there"],
            ["assistant", "Hello from the agent"],
        ]);
        expect(rows[0].from).toBe(BigInt(TEST_CHAT_ID));
        expect(rows[1].from).toBe(BigInt(-1));
    });

    it("classifies the prompt before each completion and passes the classification through", async () => {
        legacyCompletion.mockResolvedValue(text("done"));
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "Hi");
            await waitFor(() => broadcasts.length === 1);
            await handle.terminate("test complete");
        });

        expect(classifyPromptComplexity).toHaveBeenCalledWith({ iterations: 0, hasToolContext: false });
        expect(legacyCompletion).toHaveBeenCalledWith({ context: [], iterations: 0, classification });
    });

    it("runs requested tools and feeds the results back into the next completion", async () => {
        legacyCompletion
            .mockResolvedValueOnce(action({ name: "weather", input: { city: "Rochester" }, id: "call-1" }))
            .mockResolvedValueOnce(text("It is sunny in Rochester"));
        legacyAction.mockResolvedValue("sunny, 21C");
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "What's the weather?");
            await waitFor(() => broadcasts.length === 1, { description: "the final reply" });
            await handle.terminate("test complete");
        });

        expect(legacyAction).toHaveBeenCalledTimes(1);
        expect(legacyAction).toHaveBeenCalledWith("weather", { city: "Rochester" });

        // The second completion sees the tool call and its response, one iteration later, with tool context flagged.
        expect(legacyCompletion).toHaveBeenCalledTimes(2);
        expect(legacyCompletion.mock.calls[1][0]).toMatchObject({
            iterations: 1,
            context: [
                { role: "tool_call", name: "weather", input: { city: "Rochester" }, id: "call-1" },
                { role: "tool_response", id: "call-1", result: "sunny, 21C" },
            ],
        });
        expect(classifyPromptComplexity).toHaveBeenLastCalledWith({ iterations: 1, hasToolContext: true });

        expect(broadcasts).toEqual(["It is sunny in Rochester"]);
    });

    it("runs every tool call from a single completion", async () => {
        legacyCompletion
            .mockResolvedValueOnce(action(
                { name: "first", input: { a: "1" }, id: "call-a" },
                { name: "second", input: { b: "2" }, id: "call-b" },
            ))
            .mockResolvedValueOnce(text("both done"));
        legacyAction.mockImplementation(async (name: string) => `result of ${name}`);
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "do both");
            await waitFor(() => broadcasts.length === 1);
            await handle.terminate("test complete");
        });

        expect(legacyAction).toHaveBeenCalledTimes(2);
        const context = legacyCompletion.mock.calls[1][0].context as { role: string; id: string; result?: string }[];
        const responses = context.filter((entry) => entry.role === "tool_response");
        expect(responses.map((entry) => [entry.id, entry.result]).sort()).toEqual([
            ["call-a", "result of first"],
            ["call-b", "result of second"],
        ]);
    });

    it("reports a failing tool back to the model instead of failing the workflow", async () => {
        legacyCompletion
            .mockResolvedValueOnce(action({ name: "broken", input: {}, id: "call-x" }))
            .mockResolvedValueOnce(text("Sorry, that tool failed"));
        legacyAction.mockRejectedValue(ApplicationFailure.nonRetryable("tool exploded"));
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "use the broken tool");
            await waitFor(() => broadcasts.length === 1);
            await handle.terminate("test complete");
        });

        const context = legacyCompletion.mock.calls[1][0].context as { role: string; result?: string }[];
        const response = context.find((entry) => entry.role === "tool_response");
        expect(response?.result).toContain("Error executing tool broken");
        expect(response?.result).toContain("tool exploded");
        expect(broadcasts).toEqual(["Sorry, that tool failed"]);
    });

    it("handles several messages in sequence and resets tool state between turns", async () => {
        legacyCompletion
            .mockResolvedValueOnce(action({ name: "lookup", input: {}, id: "call-1" }))
            .mockResolvedValueOnce(text("first answer"))
            .mockResolvedValueOnce(text("second answer"));
        legacyAction.mockResolvedValue("data");
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);

            await sendMessage(handle, "first question");
            await waitFor(() => broadcasts.length === 1);

            await sendMessage(handle, "second question");
            await waitFor(() => broadcasts.length === 2);
            await handle.terminate("test complete");
        });

        expect(broadcasts).toEqual(["first answer", "second answer"]);

        // The third completion belongs to the second turn: no tool context and iterations back at zero.
        expect(legacyCompletion.mock.calls[2][0]).toMatchObject({ context: [], iterations: 0 });

        const rows = await storedMessages();
        expect(rows.map((row) => [row.role, row.content])).toEqual([
            ["user", "first question"],
            ["assistant", "first answer"],
            ["user", "second question"],
            ["assistant", "second answer"],
        ]);
    });

    it("persists every message that was queued while the agent was busy", async () => {
        legacyCompletion.mockResolvedValue(text("ok"));
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "one");
            await sendMessage(handle, "two");
            await sendMessage(handle, "three");

            await waitFor(async () => (await testDb.db.messages.count({ where: { role: "user" } })) === 3, { description: "all user messages to be stored" });
            await waitFor(() => broadcasts.length >= 1);
            await handle.terminate("test complete");
        });

        const userMessages = (await storedMessages()).filter((row) => row.role === "user").map((row) => row.content);
        expect(userMessages).toEqual(["one", "two", "three"]);
    });

    it("tells the user and fails the workflow when the completion activity fails permanently", async () => {
        legacyCompletion.mockRejectedValue(ApplicationFailure.nonRetryable("model unavailable"));
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            await sendMessage(handle, "hello?");

            await expect(handle.result()).rejects.toThrow();
        });

        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]).toContain("An error occurred while processing the conversation");

        // The user's message was still stored even though the agent could not answer.
        const rows = await storedMessages();
        expect(rows.map((row) => [row.role, row.content])).toEqual([["user", "hello?"]]);
    });

    it("does nothing until it receives a message", async () => {
        const worker = await createWorker();

        await worker.runUntil(async () => {
            const handle = await startWorkflow(worker);
            // Give the workflow a moment to start; nothing should have been invoked.
            await new Promise((resolve) => setTimeout(resolve, 300));
            await handle.terminate("test complete");
        });

        expect(classifyPromptComplexity).not.toHaveBeenCalled();
        expect(legacyCompletion).not.toHaveBeenCalled();
        expect(await storedMessages()).toHaveLength(0);
    });
});
