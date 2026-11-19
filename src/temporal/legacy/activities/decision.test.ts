import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decidePredicates, decisionsEndpoint } from "./decision";

const options = { baseUrl: "https://litellm.example.com/v1/", apiKey: "sk-test", model: "jev", timeoutMs: 1000 };
const questions = [
    { name: "a", instructions: "Is a true?" },
    { name: "b", instructions: "Is b true?" },
];

describe("decisionsEndpoint", () => {
    it.each([
        ["https://x.example.com", "https://x.example.com/v1/decisions"],
        ["https://x.example.com/", "https://x.example.com/v1/decisions"],
        ["https://x.example.com/v1", "https://x.example.com/v1/decisions"],
        ["https://x.example.com/v1/", "https://x.example.com/v1/decisions"],
    ])("normalises %s", (base, expected) => {
        expect(decisionsEndpoint(base)).toBe(expected);
    });
});

describe("decidePredicates", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function ok(answers: unknown[]) {
        return { ok: true, status: 200, json: async () => ({ answers }) };
    }

    it("posts every question as a predicate and returns probabilities by name", async () => {
        fetchMock.mockResolvedValue(ok([
            { type: "predicate", name: "b", probability: 0.2 },
            { type: "predicate", name: "a", probability: 0.9 },
        ]));

        const result = await decidePredicates(options, "hello", questions);

        expect(result).toEqual({ a: 0.9, b: 0.2 });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://litellm.example.com/v1/decisions");
        expect(init.headers.authorization).toBe("Bearer sk-test");
        expect(JSON.parse(init.body)).toEqual({
            model: "jev",
            input: "hello",
            questions: [
                { type: "predicate", name: "a", instructions: "Is a true?" },
                { type: "predicate", name: "b", instructions: "Is b true?" },
            ],
        });
    });

    it.each([
        ["an HTTP error", { ok: false, status: 503, json: async () => ({}) }],
        ["a missing answer", ok([{ type: "predicate", name: "a", probability: 0.5 }])],
        ["a refusal", ok([{ type: "refusal", name: "a" }, { type: "predicate", name: "b", probability: 0.5 }])],
        ["a probability outside 0 to 1", ok([{ type: "predicate", name: "a", probability: 1.5 }, { type: "predicate", name: "b", probability: 0.5 }])],
        ["a non-numeric probability", ok([{ type: "predicate", name: "a", probability: "high" }, { type: "predicate", name: "b", probability: 0.5 }])],
        ["a malformed body", { ok: true, status: 200, json: async () => ({ nope: true }) }],
    ])("throws on %s", async (_label, response) => {
        fetchMock.mockResolvedValue(response);

        await expect(decidePredicates(options, "hello", questions)).rejects.toThrow();
    });
});
