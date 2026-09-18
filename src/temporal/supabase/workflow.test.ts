import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { supabaseKeepaliveWorkflow } from "./workflow";

const taskQueue = "supabase-keepalive-test";

describe("supabaseKeepaliveWorkflow", () => {
    let testEnvironment: TestWorkflowEnvironment;

    beforeAll(async () => {
        testEnvironment = await TestWorkflowEnvironment.createTimeSkipping();
    });

    afterAll(async () => {
        await testEnvironment?.teardown();
    });

    it("runs the Supabase keepalive activity", async () => {
        let activityCalls = 0;
        const worker = await Worker.create({
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
});
