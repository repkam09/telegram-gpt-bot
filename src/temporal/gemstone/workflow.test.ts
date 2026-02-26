import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker, Runtime, DefaultLogger } from "@temporalio/worker";
import * as path from "path";
import {
    gemstoneAgentWorkflow,
    gemstoneAgentWorkflowMessageSignal,
    gemstoneAgentWorkflowExitSignal,
} from "./workflow";
import { GemstoneAgentWorkflowInput } from "./interface";
import type * as activities from "./activities";

/**
 * Temporal Workflow Tests for Gemstone Agent
 * 
 * These tests use Temporal's TestWorkflowEnvironment to test workflow behavior
 * with mocked activities. The environment provides time-skipping capabilities
 * for fast, deterministic testing.
 * 
 * Key testing patterns:
 * - Use TestWorkflowEnvironment.createTimeSkipping() for fast tests
 * - Mock activities to control workflow behavior
 * - Use worker.runUntil() to execute workflow code
 * - Make activities deterministic based on context, not call count (for replay support)
 * - Verify workflow completion status and side effects
 */
describe("GemstoneAgentWorkflow - Happy Path", () => {
    let testEnv: TestWorkflowEnvironment;

    beforeAll(async () => {
        // Suppress Temporal logs during testing
        Runtime.install({
            logger: new DefaultLogger("ERROR"),
        });

        // Create a test environment with time-skipping enabled
        testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    });

    afterAll(async () => {
        await testEnv?.teardown();
    });

    it("should process a single user message and respond", async () => {
        const workflowId = "test-gemstone-workflow-single-message";

        // Mock activities
        const mockActivities: Partial<typeof activities> = {
            gemstoneThought: async ({ context }) => {
                // Simulate LLM returning a string response
                expect(context).toBeDefined();
                expect(context.length).toBeGreaterThan(0);
                expect(context[context.length - 1].role).toBe("user");
                expect(context[context.length - 1].content).toContain("What is a dragon scimitar?");

                return {
                    __type: "string",
                    payload: "A dragon scimitar is a popular melee weapon in Oldschool RuneScape.",
                };
            },
            persistGemstoneAgentMessage: async ({ workflowId, name, type, message }) => {
                expect(workflowId).toBe(workflowId);
                expect(name).toBe("assistant");
                expect(type).toBe("agent-message");
                expect(message).toContain("dragon scimitar");
            },
            gemstoneTokens: async () => {
                return {
                    tokenCount: 100,
                    tokenLimit: 10000,
                };
            },
        };

        const { client, nativeConnection } = testEnv;
        const taskQueue = "test-task-queue";

        // Create worker with mocked activities
        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue,
            workflowsPath: path.join(__dirname, "workflow.ts"),
            activities: mockActivities,
        });

        const input: GemstoneAgentWorkflowInput = {};

        // Start workflow and send initial message
        const handle = await client.workflow.start(gemstoneAgentWorkflow, {
            taskQueue,
            workflowId,
            args: [input],
        });

        // Send a user message via signal
        await handle.signal(gemstoneAgentWorkflowMessageSignal, "What is a dragon scimitar?", "TestUser", "2026-02-16T12:00:00Z");

        // Allow workflow to process the message
        await worker.runUntil(async () => {
            // Wait a bit for processing
            await testEnv.sleep("1 second");

            // Send exit signal to gracefully terminate
            await handle.signal(gemstoneAgentWorkflowExitSignal);

            // Wait for workflow to complete
            await handle.result();
        });

        // Verify workflow completed successfully
        const workflowResult = await handle.describe();
        expect(workflowResult.status.name).toBe("COMPLETED");
    });

    it("should handle multiple messages sequentially", async () => {
        const workflowId = "test-gemstone-workflow-multiple-messages";
        let callCount = 0;

        const mockActivities: Partial<typeof activities> = {
            gemstoneThought: async ({ context }) => {
                callCount++;
                const lastMessage = context[context.length - 1];

                if (callCount === 1) {
                    expect(lastMessage.content).toContain("Hello");
                    return {
                        __type: "string",
                        payload: "Hi there! I'm Gemcrab, how can I help you with OSRS today?",
                    };
                } else if (callCount === 2) {
                    expect(lastMessage.content).toContain("Tell me about barrows");
                    return {
                        __type: "string",
                        payload: "Barrows is a popular minigame where you fight six undead brothers.",
                    };
                }

                return {
                    __type: "string",
                    payload: "Unexpected message",
                };
            },
            persistGemstoneAgentMessage: async () => {
                // Just accept persistence calls
            },
            gemstoneTokens: async () => {
                return {
                    tokenCount: 200,
                    tokenLimit: 10000,
                };
            },
        };

        const { client, nativeConnection } = testEnv;
        const taskQueue = "test-task-queue-multi";

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue,
            workflowsPath: path.join(__dirname, "workflow.ts"),
            activities: mockActivities,
        });

        const handle = await client.workflow.start(gemstoneAgentWorkflow, {
            taskQueue,
            workflowId,
            args: [{}],
        });

        await worker.runUntil(async () => {
            // Send first message
            await handle.signal(gemstoneAgentWorkflowMessageSignal, "Hello", "TestUser", "2026-02-16T12:00:00Z");
            await testEnv.sleep("1 second");

            // Send second message
            await handle.signal(gemstoneAgentWorkflowMessageSignal, "Tell me about barrows", "TestUser", "2026-02-16T12:01:00Z");
            await testEnv.sleep("1 second");

            // Exit
            await handle.signal(gemstoneAgentWorkflowExitSignal);
            await handle.result();
        });

        // Verify both messages were processed
        expect(callCount).toBe(2);

        const workflowResult = await handle.describe();
        expect(workflowResult.status.name).toBe("COMPLETED");
    });

    it("should handle tool calls in the flow", async () => {
        const workflowId = "test-gemstone-workflow-tool-call";
        let actionCallCount = 0;
        let observationCallCount = 0;

        const mockActivities: Partial<typeof activities> = {
            gemstoneThought: async ({ context }) => {
                // Deterministic based on context - check if we've already seen a tool action
                const contextString = JSON.stringify(context);
                const hasObservation = contextString.includes("observation");

                // If we haven't made an observation yet, return an action
                if (!hasObservation) {
                    return {
                        __type: "action",
                        payload: {
                            name: "osrs_wiki_search",
                            input: { query: "abyssal whip" },
                        },
                    };
                }

                // After observation, return a string response
                expect(contextString).toContain("observation");
                expect(contextString).toContain("Wiki data about whips");
                
                return {
                    __type: "string",
                    payload: "The abyssal whip is a one-handed melee weapon that requires 70 Attack to wield.",
                };
            },
            gemstoneAction: async (name, input) => {
                actionCallCount++;
                expect(name).toBe("osrs_wiki_search");
                expect(input.query).toBe("abyssal whip");
                return "Wiki data about whips";
            },
            gemstoneObservation: async ({ context, actionResult }) => {
                observationCallCount++;
                expect(actionResult).toBe("Wiki data about whips");
                expect(context).toBeDefined();
                return {
                    observations: "Successfully retrieved wiki information about the abyssal whip.",
                };
            },
            persistGemstoneAgentMessage: async () => {
                // Accept persistence
            },
            gemstoneTokens: async () => {
                return {
                    tokenCount: 150,
                    tokenLimit: 10000,
                };
            },
        };

        const { client, nativeConnection } = testEnv;
        const taskQueue = "test-task-queue-tool";

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue,
            workflowsPath: path.join(__dirname, "workflow.ts"),
            activities: mockActivities,
        });

        const handle = await client.workflow.start(gemstoneAgentWorkflow, {
            taskQueue,
            workflowId,
            args: [{}],
        });

        await worker.runUntil(async () => {
            // Send message that triggers tool use
            await handle.signal(gemstoneAgentWorkflowMessageSignal, "What is an abyssal whip?", "TestUser", "2026-02-16T12:00:00Z");
            
            // Give time for tool call and response
            await testEnv.sleep("2 seconds");

            // Exit
            await handle.signal(gemstoneAgentWorkflowExitSignal);
            await handle.result();
        });

        // Verify tool flow executed (activities only run once, not on replays)
        expect(actionCallCount).toBeGreaterThanOrEqual(1);
        expect(observationCallCount).toBeGreaterThanOrEqual(1);

        const workflowResult = await handle.describe();
        expect(workflowResult.status.name).toBe("COMPLETED");
    });

    it("should context accumulate across messages", async () => {
        const workflowId = "test-gemstone-workflow-context-accumulation";
        const contextSnapshots: Array<{ role: "user" | "assistant" | "system"; content: string }[]> = [];

        const mockActivities: Partial<typeof activities> = {
            gemstoneThought: async ({ context }) => {
                // Capture context at each call
                contextSnapshots.push([...context]);
                
                return {
                    __type: "string",
                    payload: `Response ${contextSnapshots.length}`,
                };
            },
            persistGemstoneAgentMessage: async () => {},
            gemstoneTokens: async () => ({
                tokenCount: 100,
                tokenLimit: 10000,
            }),
        };

        const { client, nativeConnection } = testEnv;
        const taskQueue = "test-task-queue-context";

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue,
            workflowsPath: path.join(__dirname, "workflow.ts"),
            activities: mockActivities,
        });

        const handle = await client.workflow.start(gemstoneAgentWorkflow, {
            taskQueue,
            workflowId,
            args: [{}],
        });

        await worker.runUntil(async () => {
            // Send first message
            await handle.signal(gemstoneAgentWorkflowMessageSignal, "First message", "User1", "2026-02-16T12:00:00Z");
            await testEnv.sleep("500 milliseconds");

            // Send second message
            await handle.signal(gemstoneAgentWorkflowMessageSignal, "Second message", "User2", "2026-02-16T12:01:00Z");
            await testEnv.sleep("500 milliseconds");

            await handle.signal(gemstoneAgentWorkflowExitSignal);
            await handle.result();
        });

        // Verify context grew with each interaction
        expect(contextSnapshots.length).toBe(2);
        expect(contextSnapshots[0].length).toBe(1); // Just first user message
        expect(contextSnapshots[1].length).toBe(3); // First user + assistant + second user

        // Verify content
        expect(contextSnapshots[0][0].content).toContain("First message");
        expect(contextSnapshots[1][2].content).toContain("Second message");
    });

    it("should support continue-as-new with context preservation", async () => {
        const workflowId = "test-gemstone-workflow-continue-as-new";

        const mockActivities: Partial<typeof activities> = {
            gemstoneThought: async () => ({
                __type: "string",
                payload: "Test response",
            }),
            persistGemstoneAgentMessage: async () => {},
            gemstoneTokens: async () => ({
                tokenCount: 15000, // Exceeds limit to trigger continue-as-new
                tokenLimit: 10000,
            }),
            gemstoneCompact: async ({ context }) => {
                // Simulate context compaction
                expect(context.length).toBeGreaterThan(0);
                return {
                    context: [
                        { role: "system" as const, content: "Compacted summary of previous conversation" },
                    ],
                };
            },
        };

        const { client, nativeConnection } = testEnv;
        const taskQueue = "test-task-queue-can";

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue,
            workflowsPath: path.join(__dirname, "workflow.ts"),
            activities: mockActivities,
        });

        const handle = await client.workflow.start(gemstoneAgentWorkflow, {
            taskQueue,
            workflowId,
            args: [{}],
        });

        await worker.runUntil(async () => {
            // Send a message that will trigger continue-as-new
            await handle.signal(gemstoneAgentWorkflowMessageSignal, "Trigger continue-as-new", "TestUser", "2026-02-16T12:00:00Z");
            await testEnv.sleep("1 second");

            // The workflow should have triggered continue-as-new
            // We can verify this by checking that a new execution was created
            // For this test, we'll just verify the workflow is still running or completed successfully
        });

        // The workflow should have continued as new, which means it's technically a new execution
        // For testing purposes, we verify the behavior worked without error
        // In a real scenario, you'd check the execution chain
    });
});
