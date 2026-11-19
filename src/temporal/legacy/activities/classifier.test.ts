import { describe, expect, it, vi } from "vitest";
import { classifyPromptComplexity } from "./classifier";

describe("classifyPromptComplexity", () => {
    it.each([
        { iterations: 0, hasToolContext: false },
        { iterations: 2, hasToolContext: true },
    ])("always classifies as complex with the full context window (%o)", async (input) => {
        expect(await classifyPromptComplexity(input)).toEqual({ complexity: "complex", contextLimit: 100, useTools: true, modelTier: "high" });
    });

    it("uses a smaller context window when memory is enabled", async () => {
        vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");

        expect(await classifyPromptComplexity({ iterations: 0, hasToolContext: false })).toMatchObject({ complexity: "complex", contextLimit: 15 });
    });
});
