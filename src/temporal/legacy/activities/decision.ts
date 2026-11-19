/**
 * Minimal client for LiteLLM's Decisions API (`POST /v1/decisions`).
 *
 * Decision models (e.g. TypeSafe Jev, gemini-decision-1) answer typed, closed-set questions with
 * calibrated probabilities instead of generating text, so one call can answer many independent
 * questions about the same input quickly and cheaply. This module is intentionally dependency
 * free so it is easy to unit test.
 */

export type DecisionPredicate = {
    name: string;
    instructions: string;
};

export type DecisionRequestOptions = {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
};

/** LiteLLM base URLs are commonly configured with a trailing `/v1` (OpenAI SDK style); normalise it away. */
export function decisionsEndpoint(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
    return `${trimmed}/v1/decisions`;
}

/**
 * Ask a decision model several yes/no questions about one input.
 * Returns the probability (0 to 1) of "yes" for each question name.
 * Throws on transport errors, non-2xx responses, refusals and missing or malformed answers,
 * so callers can fall back to their own default.
 */
export async function decidePredicates(
    options: DecisionRequestOptions,
    input: string,
    questions: DecisionPredicate[],
): Promise<Record<string, number>> {
    const response = await fetch(decisionsEndpoint(options.baseUrl), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
            model: options.model,
            input,
            questions: questions.map((question) => ({
                type: "predicate",
                name: question.name,
                instructions: question.instructions,
            })),
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) {
        throw new Error(`Decisions API returned HTTP ${response.status}`);
    }

    const body = await response.json() as { answers?: unknown };
    const answers = Array.isArray(body.answers) ? body.answers as Array<Record<string, unknown>> : [];

    const result: Record<string, number> = {};
    for (const question of questions) {
        const answer = answers.find((candidate) => candidate && candidate.name === question.name);
        if (!answer) {
            throw new Error(`Decisions API response is missing an answer for '${question.name}'`);
        }

        if (answer.type === "refusal") {
            throw new Error(`Decision model refused to answer '${question.name}'`);
        }

        if (typeof answer.probability !== "number" || answer.probability < 0 || answer.probability > 1) {
            throw new Error(`Decision model returned an invalid probability for '${question.name}'`);
        }

        result[question.name] = answer.probability;
    }

    return result;
}
