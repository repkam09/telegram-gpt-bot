import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { createInstrumentedWorker, mergeWorkflowCoverage } from "../../../tests/helpers/workflow-coverage";
import { memoryBatchWorkflow } from "./workflow";
import type { ChatMemoryResult } from "./process";

function result(chatId: string, overrides: Partial<ChatMemoryResult> = {}): ChatMemoryResult {
    return { chatId, chunks: [], stopped: "done", ...overrides };
}

describe("memoryBatchWorkflow", () => {
    let testEnvironment: TestWorkflowEnvironment;
    let queueCounter = 0;

    beforeAll(async () => {
        testEnvironment = await TestWorkflowEnvironment.createTimeSkipping();
    });

    afterAll(async () => {
        mergeWorkflowCoverage();
        await testEnvironment?.teardown();
    });

    async function run(activities: {
        listChatsWithNewMessages: () => Promise<{ chatIds: string[]; concurrency: number }>;
        processChatMemory: (chatId: string) => Promise<ChatMemoryResult>;
    }) {
        const taskQueue = `memory-workflow-test-${++queueCounter}`;
        const worker = await createInstrumentedWorker({
            connection: testEnvironment.nativeConnection,
            taskQueue,
            workflowsPath: require.resolve("./workflow.ts"),
            activities,
        });

        return worker.runUntil(
            testEnvironment.client.workflow.execute(memoryBatchWorkflow, { workflowId: `memory-batch-${queueCounter}`, taskQueue }),
        );
    }

    it("processes only the chats that were listed", async () => {
        const processed: string[] = [];

        const summary = await run({
            listChatsWithNewMessages: async () => ({ chatIds: ["1", "2", "3"], concurrency: 5 }),
            processChatMemory: async (chatId) => {
                processed.push(chatId);
                return result(chatId, { chunks: [{ firstMessageId: 1, lastMessageId: 2, messages: 2, gate: { extract: true, reason: "explicit", signals: { durable_fact: 0, update: 0, explicit: 1, forget: 0, ephemeral: 0, secret: 0 } }, changes: [{ command: "create", path: "/memories/profile.md" }] }] });
            },
        });

        expect(processed.sort()).toEqual(["1", "2", "3"]);
        expect(summary).toEqual({ chats: 3, processed: 3, failed: 0, stoppedEarly: 0, changes: 3 });
    });

    it("does nothing when no chat has new messages", async () => {
        let calls = 0;

        const summary = await run({
            listChatsWithNewMessages: async () => ({ chatIds: [], concurrency: 5 }),
            processChatMemory: async (chatId) => {
                calls++;
                return result(chatId);
            },
        });

        expect(calls).toBe(0);
        expect(summary.chats).toBe(0);
    });

    it("does not fail the run when one chat fails, and counts chats that stopped early", async () => {
        const summary = await run({
            listChatsWithNewMessages: async () => ({ chatIds: ["1", "2", "3"], concurrency: 5 }),
            processChatMemory: async (chatId) => {
                if (chatId === "2") {
                    throw new Error("boom");
                }
                return result(chatId, chatId === "3" ? { stopped: "chunk_cap" } : {});
            },
        });

        expect(summary).toMatchObject({ chats: 3, processed: 2, failed: 1, stoppedEarly: 1 });
    });

    it("respects the concurrency cap", async () => {
        let inFlight = 0;
        let maxInFlight = 0;

        await run({
            listChatsWithNewMessages: async () => ({ chatIds: ["1", "2", "3", "4", "5"], concurrency: 2 }),
            processChatMemory: async (chatId) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((resolve) => setTimeout(resolve, 20));
                inFlight--;
                return result(chatId);
            },
        });

        expect(maxInFlight).toBe(2);
    });
});
