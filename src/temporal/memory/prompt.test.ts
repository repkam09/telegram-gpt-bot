import { describe, expect, it } from "vitest";
import { formatExtractionTranscript, memoryExtractionPrompt } from "./prompt";

describe("memoryExtractionPrompt", () => {
    const prompt = memoryExtractionPrompt();

    it("carries the never-store list", () => {
        for (const rule of ["Government ID numbers", "passwords, API keys, tokens", "minor", "immigration status", "Suicide, self-harm", "Criminal history", "Psychological or personality conclusions"]) {
            expect(prompt).toContain(rule);
        }
    });

    it("skips the sensitive tier", () => {
        expect(prompt).toContain("Sensitive tier: do not store");
        expect(prompt).toContain("Political beliefs");
        expect(prompt).toContain("Health data");
    });

    it("tells the model to delete forgotten lines entirely and to keep stop-bringing-up facts", () => {
        expect(prompt).toContain("delete the line entirely");
        expect(prompt).toContain("Do not soften it");
        expect(prompt).toContain("'Stop bringing up X' is not a removal");
        expect(prompt).toContain("the later statement wins");
    });

    it("keeps one-off remarks and flattery instructions out of preferences", () => {
        expect(prompt).toContain("'shorter this time'");
        expect(prompt).toContain("flatter, never disagree");
    });
});

describe("formatExtractionTranscript", () => {
    it("keeps the order and clips very long messages", () => {
        const text = formatExtractionTranscript([
            { role: "user", content: "first" },
            { role: "assistant", content: "y".repeat(3000) },
        ]);

        expect(text.indexOf("user: first")).toBeLessThan(text.indexOf("assistant: "));
        expect(text.endsWith("...")).toBe(true);
    });
});
