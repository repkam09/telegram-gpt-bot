/**
 * Minimal client for LiteLLM's Decisions API (`POST /v1/decisions`).
 *
 * Decision models (e.g. TypeSafe Jev, gemini-decision-1) answer typed, closed-set questions with
 * calibrated probabilities instead of generating text, so a single call is cheap and has nothing to parse.
 * This module is intentionally dependency free so it is easy to unit test.
 */

export type DecisionChoice<T extends string> = {
    value: T;
    description?: string;
};

export type DecisionChoiceQuestion<T extends string> = {
    name: string;
    instructions: string;
    choices: DecisionChoice<T>[];
};

export type DecisionChoiceAnswer<T extends string> = {
    choice: T;
    confidence: number;
    probabilities: Partial<Record<T, number>>;
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
 * Ask a decision model a single pick-one question about `input`.
 * Throws on transport errors, non-2xx responses, refusals and malformed or out-of-set answers,
 * so callers can fall back to their own default.
 */
export async function decideChoice<T extends string>(
    options: DecisionRequestOptions,
    input: string,
    question: DecisionChoiceQuestion<T>,
): Promise<DecisionChoiceAnswer<T>> {
    const response = await fetch(decisionsEndpoint(options.baseUrl), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
            model: options.model,
            input,
            questions: [{
                type: "choice",
                name: question.name,
                instructions: question.instructions,
                choices: question.choices,
            }],
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) {
        throw new Error(`Decisions API returned HTTP ${response.status}`);
    }

    const body = await response.json() as { answers?: unknown };
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const answer = answers.find((candidate): candidate is Record<string, unknown> =>
        typeof candidate === "object" && candidate !== null && (candidate as Record<string, unknown>).name === question.name,
    );

    if (!answer) {
        throw new Error(`Decisions API response is missing an answer for '${question.name}'`);
    }

    if (answer.type === "refusal") {
        throw new Error(`Decision model refused to answer '${question.name}'`);
    }

    const picked = answer.choice;
    const allowed = question.choices.map((choice) => choice.value as string);
    if (typeof picked !== "string" || !allowed.includes(picked)) {
        throw new Error(`Decision model returned an unexpected choice for '${question.name}': ${String(picked)}`);
    }

    const confidence = typeof answer.confidence === "number" ? answer.confidence : 0;
    const probabilities: Partial<Record<T, number>> = {};
    if (Array.isArray(answer.probabilities)) {
        for (const entry of answer.probabilities as Array<{ value?: unknown; probability?: unknown }>) {
            if (typeof entry.value === "string" && typeof entry.probability === "number") {
                probabilities[entry.value as T] = entry.probability;
            }
        }
    }

    return { choice: picked as T, confidence, probabilities };
}
