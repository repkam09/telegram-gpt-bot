/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processDefinedToolCalls } from "../../src/tools/tools";
import { HennosBaseTool } from "../../src/tools/BaseTool";
import { ToolCall } from "ollama";

describe("processDefinedToolCalls", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should process a single tool call successfully", async () => {
        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "test_tool",
                    description: "A test tool",
                    parameters: {
                        type: "object",
                        properties: {},
                        required: []
                    }
                }
            }),
            callback: vi.fn().mockResolvedValue(["test result", { metadata: "test" }])
        };

        const toolCall: ToolCall = {
            function: {
                name: "test_tool",
                arguments: { input: "test" }
            }
        };

        const results = await processDefinedToolCalls("test-workflow", [mockTool], [[toolCall, {}]]);

        expect(results).toHaveLength(1);
        expect(results[0][0]).toBe("test result");
        expect(mockTool.callback).toHaveBeenCalledWith("test-workflow", { input: "test" }, {});
    });

    it("should process multiple tool calls", async () => {
        const mockTool1: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "tool_1",
                    description: "Tool 1",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockResolvedValue(["result 1", {}])
        };

        const mockTool2: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "tool_2",
                    description: "Tool 2",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockResolvedValue(["result 2", {}])
        };

        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "tool_1", arguments: {} } }, {}],
            [{ function: { name: "tool_2", arguments: {} } }, {}]
        ];

        const results = await processDefinedToolCalls("test-workflow", [mockTool1, mockTool2], toolCalls);

        expect(results).toHaveLength(2);
        expect(results[0][0]).toBe("result 1");
        expect(results[1][0]).toBe("result 2");
    });

    it("should handle unknown tool calls", async () => {
        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "known_tool",
                    description: "Known tool",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockResolvedValue(["known result", {}])
        };

        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "unknown_tool", arguments: {} } }, {}]
        ];

        const results = await processDefinedToolCalls("test-workflow", [mockTool], toolCalls);

        expect(results).toHaveLength(1);
        expect(results[0][0]).toContain("Unknown tool call: unknown_tool");
    });

    it("should preserve metadata through tool calls", async () => {
        const testMetadata = { userId: "123", chatId: "456" };

        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "test_tool",
                    description: "Test",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockImplementation(async (wid, args, meta) => ["result", meta])
        };

        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "test_tool", arguments: {} } }, testMetadata]
        ];

        const results = await processDefinedToolCalls("test-workflow", [mockTool], toolCalls);

        expect(results[0][1]).toEqual(testMetadata);
    });

    it("should pass arguments to tool callbacks", async () => {
        const mockCallback = vi.fn().mockResolvedValue(["result", {}]);

        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "test_tool",
                    description: "Test",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: mockCallback
        };

        const args = { param1: "value1", param2: "value2" };
        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "test_tool", arguments: args } }, {}]
        ];

        await processDefinedToolCalls("test-workflow", [mockTool], toolCalls);

        expect(mockCallback).toHaveBeenCalledWith("test-workflow", args, {});
    });

    it("should handle tool callback errors gracefully", async () => {
        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "failing_tool",
                    description: "Failing tool",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockRejectedValue(new Error("Tool execution failed"))
        };

        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "failing_tool", arguments: {} } }, {}]
        ];

        const results = await processDefinedToolCalls("test-workflow", [mockTool], toolCalls);

        // The function catches errors and returns empty array
        expect(results).toEqual([]);
    });

    it("should process tool calls in parallel", async () => {
        const delays = [100, 50, 75];
        const tools = delays.map((delay, index) => ({
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: `tool_${index}`,
                    description: `Tool ${index}`,
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, delay));
                return [`result_${index}`, {}];
            })
        } as HennosBaseTool));

        const toolCalls: [ToolCall, any][] = delays.map((_, index) => [
            { function: { name: `tool_${index}`, arguments: {} } },
            {}
        ]);

        const startTime = Date.now();
        const results = await processDefinedToolCalls("test-workflow", tools, toolCalls);
        const duration = Date.now() - startTime;

        // Should complete in approximately max delay time (100ms) rather than sum (225ms)
        expect(duration).toBeLessThan(200); // Some buffer for execution overhead
        expect(results).toHaveLength(3);
    });

    it("should return empty array when no tool calls provided", async () => {
        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "test_tool",
                    description: "Test",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn()
        };

        const results = await processDefinedToolCalls("test-workflow", [mockTool], []);

        expect(results).toEqual([]);
        expect(mockTool.callback).not.toHaveBeenCalled();
    });

    it("should handle mix of successful and unknown tools", async () => {
        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "known_tool",
                    description: "Known",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: vi.fn().mockResolvedValue(["known result", {}])
        };

        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "known_tool", arguments: {} } }, {}],
            [{ function: { name: "unknown_tool", arguments: {} } }, {}],
            [{ function: { name: "known_tool", arguments: {} } }, {}]
        ];

        const results = await processDefinedToolCalls("test-workflow", [mockTool], toolCalls);

        expect(results).toHaveLength(3);
        expect(results[0][0]).toBe("known result");
        expect(results[1][0]).toContain("Unknown tool call");
        expect(results[2][0]).toBe("known result");
    });

    it("should pass workflowId to all tool callbacks", async () => {
        const mockCallback = vi.fn().mockResolvedValue(["result", {}]);

        const mockTool: HennosBaseTool = {
            isEnabled: () => true,
            definition: () => ({
                type: "function",
                function: {
                    name: "test_tool",
                    description: "Test",
                    parameters: { type: "object", properties: {}, required: [] }
                }
            }),
            callback: mockCallback
        };

        const toolCalls: [ToolCall, any][] = [
            [{ function: { name: "test_tool", arguments: {} } }, {}]
        ];

        await processDefinedToolCalls("custom-workflow-id", [mockTool], toolCalls);

        expect(mockCallback).toHaveBeenCalledWith("custom-workflow-id", expect.any(Object), expect.any(Object));
    });
});
