import { Config } from "../../singletons/config";
import { decidePredicates, DecisionPredicate } from "../legacy/activities/decision";

export type MemoryMessage = { id: number; role: string; content: string };

/** Probabilities of "yes" from the decision model, one per question. */
export type MemoryGateSignals = {
    durable_fact: number;
    update: number;
    explicit: number;
    forget: number;
    secret: number;
}

export type MemoryGateDecision = {
    extract: boolean;
    reason: string;
    signals: MemoryGateSignals;
}

// ─── Tuning ─────────────────────────────────────────────────────────────────
//
// The gate is biased toward recall: a missed memory is recovered at best by luck, an unnecessary extraction
// only costs one low-tier call. Removal requests are never dropped, so `forget` has the lowest threshold.

export const FORGET_THRESHOLD = 0.2;
export const EXPLICIT_THRESHOLD = 0.3;
export const DURABLE_THRESHOLD = 0.35;
export const UPDATE_THRESHOLD = 0.3;
export const SECRET_THRESHOLD = 0.8;

const DECISION_TIMEOUT_MS = 15000;
const DECISION_MESSAGE_MAX_CHARS = 500;

export const MEMORY_GATE_QUESTIONS: DecisionPredicate[] = [
    {
        name: "durable_fact",
        instructions: "Does the user state a stable fact about themselves or the people in their life, such as relationships, where they live, their job, preferences, routines, or an ongoing project?",
    },
    {
        name: "update",
        instructions: "Does the user correct or change something they said before, change a standing preference, or say that a plan or project has changed?",
    },
    {
        name: "explicit",
        instructions: "Does the user ask the assistant to remember something?",
    },
    {
        name: "forget",
        instructions: "Does the user ask the assistant to forget, delete or stop remembering something, or say that something the assistant knows about them is wrong or outdated?",
    },
    {
        name: "secret",
        instructions: "Does the conversation contain credentials or similar secrets such as passwords, API keys, tokens, card numbers or government ID numbers?",
    },
];

/** Suffix added to the reason when the chunk was flagged as possibly containing a secret. */
export const SECRET_FLAGGED = "+secret_flagged";

/**
 * Combines the decision model's signals into an extract / skip decision.
 *
 * - A forget request always wins: removals must never be dropped.
 * - An explicit "remember this" or a likely durable fact / update is extracted.
 * - A likely secret does not skip the chunk (that would permanently drop every other fact in it, because the
 *   watermark advances). The extraction prompt enforces the never-store rules, and the reason is flagged
 *   so the run can be reviewed in the logs.
 */
export function decideGate(signals: MemoryGateSignals): MemoryGateDecision {
    let reason: string | null = null;

    if (signals.forget >= FORGET_THRESHOLD) {
        reason = "forget";
    } else if (signals.explicit >= EXPLICIT_THRESHOLD) {
        reason = "explicit";
    } else if (signals.durable_fact >= DURABLE_THRESHOLD || signals.update >= UPDATE_THRESHOLD) {
        reason = "durable_or_update";
    }

    if (reason === null) {
        return { extract: false, reason: "nothing_durable", signals };
    }

    return { extract: true, reason: signals.secret >= SECRET_THRESHOLD ? `${reason}${SECRET_FLAGGED}` : reason, signals };
}

export function formatGateInput(messages: MemoryMessage[]): string {
    const clip = (text: string) => text.length > DECISION_MESSAGE_MAX_CHARS ? `${text.slice(0, DECISION_MESSAGE_MAX_CHARS)}...` : text;
    return `Conversation:\n${messages.map((message) => `${message.role}: ${clip(message.content)}`).join("\n")}`;
}

/**
 * Runs the gate for one chunk of messages. Throws when no decision model is configured or the call fails;
 * the caller treats that as "stop this chat for tonight and keep the watermark".
 */
export async function runGate(messages: MemoryMessage[]): Promise<MemoryGateDecision> {
    const model = Config.HENNOS_MEMORY_DECISION_MODEL;
    if (!model) {
        throw new Error("No memory decision model configured (HENNOS_MEMORY_DECISION_MODEL or HENNOS_CLASSIFIER_DECISION_MODEL)");
    }

    const probabilities = await decidePredicates(
        {
            baseUrl: Config.LITELLM_BASE_URL,
            apiKey: Config.LITELLM_API_KEY,
            model,
            timeoutMs: DECISION_TIMEOUT_MS,
        },
        formatGateInput(messages),
        MEMORY_GATE_QUESTIONS,
    );

    return decideGate(probabilities as MemoryGateSignals);
}
