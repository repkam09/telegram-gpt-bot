import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideGate, formatGateInput, MEMORY_GATE_QUESTIONS, MemoryGateSignals, runGate } from "./gate";

const signals = (overrides: Partial<MemoryGateSignals> = {}): MemoryGateSignals => ({
    durable_fact: 0, update: 0, explicit: 0, forget: 0, ephemeral: 0, secret: 0, ...overrides,
});

describe("decideGate", () => {
    it("skips a chunk with nothing durable", () => {
        expect(decideGate(signals({ ephemeral: 0.95, durable_fact: 0.05 })).extract).toBe(false);
    });

    it("extracts a likely durable fact or update with a generous threshold", () => {
        expect(decideGate(signals({ durable_fact: 0.4 }))).toMatchObject({ extract: true, reason: "durable_or_update" });
        expect(decideGate(signals({ update: 0.35 }))).toMatchObject({ extract: true, reason: "durable_or_update" });
        expect(decideGate(signals({ durable_fact: 0.2, update: 0.1 })).extract).toBe(false);
    });

    it("extracts an explicit remember request over a low threshold", () => {
        expect(decideGate(signals({ explicit: 0.35 }))).toMatchObject({ extract: true, reason: "explicit" });
    });

    it("never drops a forget request, even at a very low probability or next to a secret", () => {
        expect(decideGate(signals({ forget: 0.25 }))).toMatchObject({ extract: true, reason: "forget" });
        expect(decideGate(signals({ forget: 0.25, secret: 0.99 }))).toMatchObject({ extract: true, reason: "forget" });
        expect(decideGate(signals({ forget: 0.1 })).extract).toBe(false);
    });

    it("skips chunks with a likely secret unless they hold a forget request", () => {
        expect(decideGate(signals({ secret: 0.9, durable_fact: 0.9 }))).toMatchObject({ extract: false, reason: "secret" });
        expect(decideGate(signals({ secret: 0.9, explicit: 0.9 }))).toMatchObject({ extract: false, reason: "secret" });
        expect(decideGate(signals({ secret: 0.5, durable_fact: 0.9 })).extract).toBe(true);
    });
});

describe("formatGateInput", () => {
    it("lists the messages in order and clips long ones", () => {
        const input = formatGateInput([
            { id: 1, role: "user", content: "hello" },
            { id: 2, role: "assistant", content: "x".repeat(600) },
        ]);

        expect(input.startsWith("Conversation:\nuser: hello\nassistant: ")).toBe(true);
        expect(input.endsWith("...")).toBe(true);
        expect(input.length).toBeLessThan(600);
    });
});

describe("runGate", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubEnv("LITELLM_BASE_URL", "https://litellm.example.com");
        vi.stubEnv("LITELLM_API_KEY", "sk-test");
        vi.stubEnv("HENNOS_MEMORY_DECISION_MODEL", "jev");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function answer(overrides: Partial<MemoryGateSignals>) {
        const values = signals(overrides);
        return {
            ok: true,
            status: 200,
            json: async () => ({ answers: MEMORY_GATE_QUESTIONS.map((question) => ({ type: "predicate", name: question.name, probability: values[question.name as keyof MemoryGateSignals] })) }),
        };
    }

    it("asks every gate question and returns the decision with its signals", async () => {
        fetchMock.mockResolvedValue(answer({ durable_fact: 0.9 }));

        const decision = await runGate([{ id: 1, role: "user", content: "I live in Rochester" }]);

        expect(decision.extract).toBe(true);
        expect(decision.signals.durable_fact).toBe(0.9);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.model).toBe("jev");
        expect(body.questions.map((question: { name: string }) => question.name)).toEqual(MEMORY_GATE_QUESTIONS.map((question) => question.name));
    });

    it("uses the classifier decision model when no memory decision model is set", async () => {
        vi.stubEnv("HENNOS_MEMORY_DECISION_MODEL", "");
        vi.stubEnv("HENNOS_CLASSIFIER_DECISION_MODEL", "classifier-model");
        fetchMock.mockResolvedValue(answer({}));

        await runGate([{ id: 1, role: "user", content: "hi" }]);

        expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("classifier-model");
    });

    it("throws when the API fails so the caller keeps the watermark", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

        await expect(runGate([{ id: 1, role: "user", content: "hi" }])).rejects.toThrow("HTTP 500");
    });

    it("throws when no decision model is configured", async () => {
        vi.stubEnv("HENNOS_MEMORY_DECISION_MODEL", "");

        await expect(runGate([{ id: 1, role: "user", content: "hi" }])).rejects.toThrow("No memory decision model");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
