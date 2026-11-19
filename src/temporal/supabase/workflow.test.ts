import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { createInstrumentedWorker, mergeWorkflowCoverage } from "../../../tests/helpers/workflow-coverage";
import { supabaseKeepaliveWorkflow } from "./workflow";

const taskQueue = "supabase-keepalive-test";

describe("supabaseKeepaliveWorkflow", () => {
    let testEnvironment: TestWorkflowEnvironment;

    beforeAll(async () => {
        testEnvironment = await TestWorkflowEnvironment.createTimeSkipping();
    });

    afterAll(async () => {
        mergeWorkflowCoverage();
        await testEnvironment?.teardown();
    });

    it("runs the Supabase keepalive activity", async () => {
        let activityCalls = 0;
        const worker = await createInstrumentedWorker({
            connection: testEnvironment.nativeConnection,
            taskQueue,
            workflowsPath: require.resolve("./workflow.ts"),
            activities: {
                keepSupabaseActive: async () => {
                    activityCalls += 1;
                },
            },
        });

        await worker.runUntil(testEnvironment.client.workflow.execute(supabaseKeepaliveWorkflow, {
            workflowId: "supabase-keepalive-test",
            taskQueue,
        }));

        expect(activityCalls).toBe(1);
    });

    it("retries the keepalive activity when it fails transiently", async () => {
        let activityCalls = 0;
        const retryQueue = `${taskQueue}-retry`;
        const worker = await createInstrumentedWorker({
            connection: testEnvironment.nativeConnection,
            taskQueue: retryQueue,
            workflowsPath: require.resolve("./workflow.ts"),
            activities: {
                keepSupabaseActive: async () => {
                    activityCalls += 1;
                    if (activityCalls < 3) {
                        throw new Error("supabase unavailable");
                    }
                },
            },
        });

        await worker.runUntil(testEnvironment.client.workflow.execute(supabaseKeepaliveWorkflow, {
            workflowId: "supabase-keepalive-retry-test",
            taskQueue: retryQueue,
        }));

        expect(activityCalls).toBe(3);
    });

    it("fails the workflow once retries are exhausted", async () => {
        let activityCalls = 0;
        const failQueue = `${taskQueue}-fail`;
        const worker = await createInstrumentedWorker({
            connection: testEnvironment.nativeConnection,
            taskQueue: failQueue,
            workflowsPath: require.resolve("./workflow.ts"),
            activities: {
                keepSupabaseActive: async () => {
                    activityCalls += 1;
                    throw new Error("supabase down");
                },
            },
        });

        await expect(worker.runUntil(testEnvironment.client.workflow.execute(supabaseKeepaliveWorkflow, {
            workflowId: "supabase-keepalive-fail-test",
            taskQueue: failQueue,
        }))).rejects.toThrow();

        // maximumAttempts is 3
        expect(activityCalls).toBe(3);
    });
});
