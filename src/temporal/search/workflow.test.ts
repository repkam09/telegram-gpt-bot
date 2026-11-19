import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { searchWorkflow } from "./workflow";

describe("searchWorkflow", () => {
    let testEnvironment: TestWorkflowEnvironment;
    let queueCounter = 0;

    beforeAll(async () => {
        testEnvironment = await TestWorkflowEnvironment.createTimeSkipping();
    });

    afterAll(async () => {
        await testEnvironment?.teardown();
    });

    async function run(query: string, activities: { searchResults: (...args: never[]) => Promise<object[]>; summarizeResults: (...args: never[]) => Promise<string | null> }) {
        const taskQueue = `search-workflow-test-${++queueCounter}`;
        const worker = await Worker.create({
            connection: testEnvironment.nativeConnection,
            taskQueue,
            workflowsPath: require.resolve("./workflow.ts"),
            activities,
        });

        return worker.runUntil(
            testEnvironment.client.workflow.execute(searchWorkflow, { workflowId: `search-${queueCounter}`, taskQueue, args: [{ query }] }),
        );
    }

    it("returns the search results together with their summary", async () => {
        const results = [{ title: "One" }, { title: "Two" }];
        const searchResults = vi.fn().mockResolvedValue(results);
        const summarizeResults = vi.fn().mockResolvedValue("a summary");

        const output = await run("temporal testing", { searchResults, summarizeResults });

        expect(output).toEqual({ results, summary: "a summary" });
        expect(searchResults).toHaveBeenCalledWith({ query: "temporal testing" });
        expect(summarizeResults).toHaveBeenCalledWith({ query: "temporal testing" }, results);
    });

    it("allows the summary to be null", async () => {
        const output = await run("q", {
            searchResults: async () => [],
            summarizeResults: async () => null,
        });

        expect(output).toEqual({ results: [], summary: null });
    });
});
