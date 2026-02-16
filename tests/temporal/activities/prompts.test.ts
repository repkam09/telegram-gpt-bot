import { describe, it, expect } from "vitest";
import { observationPromptTemplate } from "../../../src/temporal/agent/activities/observation";
import { thoughtPromptTemplate } from "../../../src/temporal/agent/activities/thought";
import { compactPromptTemplate } from "../../../src/temporal/agent/activities/compact";

describe("observationPromptTemplate", () => {
    it("should interpolate action result and previous steps", () => {
        const input = {
            actionResult: "Weather is sunny, 72°F",
            previousSteps: "User asked about weather\nAgent decided to check weather"
        };

        const result = observationPromptTemplate(input);

        expect(result).toContain("Weather is sunny, 72°F");
        expect(result).toContain("User asked about weather");
    });
});

describe("thoughtPromptTemplate", () => {
    it("should interpolate all input parameters", () => {
        const input = {
            currentDate: "2026-02-16",
            previousSteps: "User: What's the weather?\nAssistant: Let me check",
            availableActions: "weather_lookup - Check current weather"
        };

        const result = thoughtPromptTemplate(input);

        expect(result).toContain("2026-02-16");
        expect(result).toContain("User: What's the weather?");
        expect(result).toContain("weather_lookup - Check current weather");
    });

    it("should calculate day of week from current date", () => {
        const testDate = new Date("2026-02-17"); // Tuesday
        const dayOfWeek = testDate.getDay();
        const expectedDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

        const result = thoughtPromptTemplate({
            currentDate: "2026-02-17",
            previousSteps: "",
            availableActions: ""
        });

        expect(result).toContain(expectedDay);
    });
});

describe("compactPromptTemplate", () => {
    it("should interpolate context history", () => {
        const result = compactPromptTemplate({
            contextHistory: "User: Hello\nAssistant: Hi there!\nUser: What's 2+2?\nAssistant: 4"
        });

        expect(result).toContain("User: Hello");
        expect(result).toContain("Assistant: Hi there!");
    });
});
