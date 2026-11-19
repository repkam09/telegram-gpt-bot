import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { reviewEmailWorkflow } from "./workflow";
import type { RawEmail } from "../../singletons/gmail";

function email(id: string): RawEmail {
    return { id, subject: `Subject ${id}`, from: "a@example.com", to: "b@example.com", date: "2026-11-18", body: `Body ${id}` };
}

describe("reviewEmailWorkflow", () => {
    let testEnvironment: TestWorkflowEnvironment;
    let queueCounter = 0;

    beforeAll(async () => {
        testEnvironment = await TestWorkflowEnvironment.createTimeSkipping();
    });

    afterAll(async () => {
        await testEnvironment?.teardown();
    });

    async function run(activities: {
        fetchEmails: () => Promise<string[]>;
        fetchEmailById: (id: string) => Promise<RawEmail | undefined>;
        summarizeEmails: (emails: RawEmail[]) => Promise<string>;
        signalSummary: (summary: string) => Promise<void>;
    }) {
        const taskQueue = `email-workflow-test-${++queueCounter}`;
        const worker = await Worker.create({
            connection: testEnvironment.nativeConnection,
            taskQueue,
            workflowsPath: require.resolve("./workflow.ts"),
            activities,
        });

        await worker.runUntil(
            testEnvironment.client.workflow.execute(reviewEmailWorkflow, { workflowId: `email-review-${queueCounter}`, taskQueue }),
        );
    }

    it("fetches each email, summarizes them together and signals the summary", async () => {
        const fetchEmails = vi.fn().mockResolvedValue(["1", "2"]);
        const fetchEmailById = vi.fn(async (id: string) => email(id));
        const summarizeEmails = vi.fn().mockResolvedValue("the summary");
        const signalSummary = vi.fn().mockResolvedValue(undefined);

        await run({ fetchEmails, fetchEmailById, summarizeEmails, signalSummary });

        expect(fetchEmailById.mock.calls.map((call) => call[0])).toEqual(["1", "2"]);
        expect(summarizeEmails).toHaveBeenCalledTimes(1);
        expect(summarizeEmails).toHaveBeenCalledWith([email("1"), email("2")]);
        expect(signalSummary).toHaveBeenCalledWith("the summary");
    });

    it("skips emails that could not be fetched", async () => {
        const summarizeEmails = vi.fn().mockResolvedValue("summary");
        const signalSummary = vi.fn().mockResolvedValue(undefined);

        await run({
            fetchEmails: async () => ["1", "2", "3"],
            fetchEmailById: async (id) => (id === "2" ? undefined : email(id)),
            summarizeEmails,
            signalSummary,
        });

        expect(summarizeEmails).toHaveBeenCalledWith([email("1"), email("3")]);
    });

    it("exits without summarizing or signalling when there is nothing to review", async () => {
        const summarizeEmails = vi.fn();
        const signalSummary = vi.fn();

        await run({
            fetchEmails: async () => [],
            fetchEmailById: async () => undefined,
            summarizeEmails,
            signalSummary,
        });

        expect(summarizeEmails).not.toHaveBeenCalled();
        expect(signalSummary).not.toHaveBeenCalled();
    });

    it("exits without signalling when none of the emails could be fetched", async () => {
        const summarizeEmails = vi.fn();
        const signalSummary = vi.fn();

        await run({
            fetchEmails: async () => ["1"],
            fetchEmailById: async () => undefined,
            summarizeEmails,
            signalSummary,
        });

        expect(summarizeEmails).not.toHaveBeenCalled();
        expect(signalSummary).not.toHaveBeenCalled();
    });

    it("retries a transiently failing activity", async () => {
        let attempts = 0;
        const signalSummary = vi.fn().mockResolvedValue(undefined);

        await run({
            fetchEmails: async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw new Error("gmail hiccup");
                }
                return ["1"];
            },
            fetchEmailById: async (id) => email(id),
            summarizeEmails: async () => "summary",
            signalSummary,
        });

        expect(attempts).toBe(3);
        expect(signalSummary).toHaveBeenCalledWith("summary");
    });
});
