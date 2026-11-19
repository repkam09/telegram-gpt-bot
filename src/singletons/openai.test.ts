import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertCompletionMessages, convertHennosMessages, convertHennosTools, HennosOpenAIProvider } from "./openai";
import type { CompletionContextEntry, HennosTool } from "../provider";

describe("convertHennosMessages", () => {
    it("maps text messages to chat messages", () => {
        expect(convertHennosMessages([
            { type: "text", role: "system", content: "be nice" },
            { type: "text", role: "user", content: "hi" },
            { type: "text", role: "assistant", content: "hello" },
        ])).toEqual([
            { role: "system", content: "be nice" },
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
        ]);
    });

    it("drops messages with empty content", () => {
        expect(convertHennosMessages([
            { type: "text", role: "user", content: "" },
            { type: "text", role: "user", content: "kept" },
        ])).toEqual([{ role: "user", content: "kept" }]);
    });
});

describe("convertCompletionMessages", () => {
    it("maps text entries", () => {
        expect(convertCompletionMessages([{ role: "user", content: "hi" }])).toEqual([{ role: "user", content: "hi" }]);
    });

    it("maps images to a user message with a text label and a data URL", () => {
        const entries: CompletionContextEntry[] = [{
            role: "user",
            image: { local: "/tmp/cat.png", mime: "image/png" },
            encoded: { __type: "b64_image", data: "QUJD" },
        }];

        expect(convertCompletionMessages(entries)).toEqual([{
            role: "user",
            content: [
                { type: "text", text: "Image /tmp/cat.png created by the user" },
                { type: "image_url", image_url: { detail: "auto", url: "data:image/png;base64,QUJD" } },
            ],
        }]);
    });

    it("maps a tool call to an assistant message with JSON-encoded arguments", () => {
        expect(convertCompletionMessages([{ role: "tool_call", id: "call-1", name: "weather", input: { city: "Rochester" } }])).toEqual([{
            role: "assistant",
            tool_calls: [{ type: "function", id: "call-1", function: { name: "weather", arguments: "{\"city\":\"Rochester\"}" } }],
        }]);
    });

    it("maps a tool response to a tool message tied to the call id", () => {
        expect(convertCompletionMessages([{ role: "tool_response", id: "call-1", result: "sunny" }])).toEqual([
            { role: "tool", tool_call_id: "call-1", content: "sunny" },
        ]);
    });

    it("preserves the order of a mixed conversation", () => {
        const result = convertCompletionMessages([
            { role: "system", content: "sys" },
            { role: "user", content: "question" },
            { role: "tool_call", id: "c", name: "t", input: {} },
            { role: "tool_response", id: "c", result: "r" },
        ]);

        expect(result.map((message) => message.role)).toEqual(["system", "user", "assistant", "tool"]);
    });
});

describe("convertHennosTools", () => {
    const tool: HennosTool = {
        type: "function",
        function: {
            name: "weather",
            description: "Look up the weather",
            parameters: { type: "object", properties: { city: { type: "string", description: "City" } }, required: ["city"] },
        },
    };

    it("maps function definitions", () => {
        expect(convertHennosTools([tool])).toEqual([{
            type: "function",
            function: { name: "weather", description: "Look up the weather", parameters: tool.function.parameters },
        }]);
    });

    it("rejects tools without a function name", () => {
        const broken = { type: "function", function: { name: "", description: "", parameters: { type: "object", properties: {}, required: [] } } } as HennosTool;

        expect(() => convertHennosTools([broken])).toThrow(/Invalid Tool Shape/);
    });
});

describe("HennosOpenAIProvider", () => {
    const create = vi.fn();
    let provider: HennosOpenAIProvider;

    function reply(choice: Record<string, unknown>) {
        return { choices: [choice], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    }

    beforeEach(() => {
        create.mockReset();
        provider = new HennosOpenAIProvider({ MODEL: "test-model", CTX: 1234 }, "http://litellm.test/v1", "test-key", "LiteLLM");
        // Replace the network layer only; everything else is the real provider code.
        (provider.client as unknown as { chat: unknown }).chat = { completions: { create } };
    });

    it("exposes the configured context limit", () => {
        expect(provider.limit()).toBe(1234);
    });

    it("returns text for a stop finish reason and sends the model, messages and safety id", async () => {
        create.mockResolvedValue(reply({ finish_reason: "stop", message: { content: "hello" } }));

        const result = await provider.completion("wf", [{ role: "user", content: "hi" }], 0);

        expect(result).toEqual({ __type: "string", payload: "hello" });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            model: "test-model",
            messages: [{ role: "user", content: "hi" }],
            safety_identifier: "wf",
            tools: undefined,
            tool_choice: undefined,
        }));
    });

    it("offers tools with auto tool choice and parallel calls", async () => {
        create.mockResolvedValue(reply({ finish_reason: "stop", message: { content: "ok" } }));
        const tool: HennosTool = { type: "function", function: { name: "t", description: "d", parameters: { type: "object", properties: {}, required: [] } } };

        await provider.completion("wf", [{ role: "user", content: "hi" }], 0, [tool]);

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ tool_choice: "auto", parallel_tool_calls: true, tools: expect.any(Array) }));
    });

    it("stops offering tools once the tool depth limit is reached", async () => {
        vi.stubEnv("HENNOS_TOOL_DEPTH", "2");
        create.mockResolvedValue(reply({ finish_reason: "stop", message: { content: "ok" } }));
        const tool: HennosTool = { type: "function", function: { name: "t", description: "d", parameters: { type: "object", properties: {}, required: [] } } };

        await provider.completion("wf", [{ role: "user", content: "hi" }], 2, [tool]);

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ tools: undefined, tool_choice: undefined }));
    });

    it("parses tool call arguments into objects for completions", async () => {
        create.mockResolvedValue(reply({
            finish_reason: "tool_calls",
            message: { tool_calls: [{ type: "function", id: "call-1", function: { name: "weather", arguments: "{\"city\":\"Rochester\"}" } }] },
        }));

        const result = await provider.completion("wf", [{ role: "user", content: "hi" }], 0);

        expect(result).toEqual({ __type: "tool", payload: [{ name: "weather", input: { city: "Rochester" }, id: "call-1" }] });
    });

    it("leaves tool call arguments as a string for invoke", async () => {
        create.mockResolvedValue(reply({
            finish_reason: "tool_calls",
            message: { tool_calls: [{ type: "function", id: "call-1", function: { name: "classify_simple", arguments: "{}" } }] },
        }));

        const result = await provider.invoke("wf", [{ type: "text", role: "user", content: "hi" }]);

        expect(result).toEqual({ __type: "tool", payload: [{ name: "classify_simple", input: "{}" }] });
    });

    it("returns a canned message when the content filter triggers", async () => {
        create.mockResolvedValue(reply({ finish_reason: "content_filter", message: { content: null } }));

        const result = await provider.completion("wf", [{ role: "user", content: "hi" }], 0);

        expect(result.__type).toBe("string");
        expect((result as { payload: string }).payload).toContain("Content Filter Triggered");
    });

    it("continues the generation when the response is cut off by the length limit", async () => {
        create
            .mockResolvedValueOnce(reply({ finish_reason: "length", message: { content: "partial " } }))
            .mockResolvedValueOnce(reply({ finish_reason: "stop", message: { content: "rest" } }));

        const result = await provider.completion("wf", [{ role: "user", content: "hi" }], 0);

        expect(result).toEqual({ __type: "string", payload: "rest" });
        expect(create).toHaveBeenCalledTimes(2);
        const secondPrompt = create.mock.calls[1][0].messages;
        expect(secondPrompt[secondPrompt.length - 1]).toEqual({ role: "assistant", content: "partial " });
    });

    it("throws for a stop response without content", async () => {
        create.mockResolvedValue(reply({ finish_reason: "stop", message: { content: "" } }));

        await expect(provider.completion("wf", [{ role: "user", content: "hi" }], 0)).rejects.toThrow(/Missing Expected Content/);
    });

    it("throws for a tool_calls response without tool calls", async () => {
        create.mockResolvedValue(reply({ finish_reason: "tool_calls", message: { tool_calls: [] } }));

        await expect(provider.completion("wf", [{ role: "user", content: "hi" }], 0)).rejects.toThrow(/Missing Expected Tool Calls/);
    });

    it("throws for an unknown finish reason", async () => {
        create.mockResolvedValue(reply({ finish_reason: "mystery", message: { content: "x" } }));

        await expect(provider.completion("wf", [{ role: "user", content: "hi" }], 0)).rejects.toThrow(/Unhandled Finish Reason: mystery/);
    });
});
