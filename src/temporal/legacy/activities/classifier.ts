import { Config } from "../../../singletons/config";
import { Database } from "../../../database";
import { Logger } from "../../../singletons/logger";
import { parseWorkflowId } from "../interface";
import { decidePredicates, DecisionPredicate } from "./decision";
import { Context } from "@temporalio/activity";

export type PromptComplexity = "trivial" | "simple" | "complex";

export type PromptComplexityResult = {
    complexity: PromptComplexity;
    contextLimit: number;
    useTools: boolean;
    modelTier: "high" | "low" | "nano";
}

export type ClassifyPromptInput = {
    iterations: number;
    hasToolContext: boolean;
}

/** Probabilities of "yes" from the decision model, one per question. */
export type PromptSignals = {
    deep: number;
    context: number;
    casual: number;
    lookup: number;
}

// ─── Tuning ─────────────────────────────────────────────────────────────────
//
// Misrouting is not symmetric: a cheap model on a book manuscript is a much worse outcome than a strong
// model on a greeting. So the high tier is the default, and the cheaper tiers need confident evidence.

const DEEP_THRESHOLD = 0.25; // any real hint of depth routes high
const CONTEXT_THRESHOLD = 0.5; // depends on earlier conversation or shared material
const NANO_MIN_CASUAL = 0.85;
const NANO_MAX_DEEP = 0.15;
const NANO_MAX_CONTEXT = 0.3;
const LOW_MIN_LOOKUP = 0.7;

const DECISION_TIMEOUT_MS = 3000;
const DECISION_RECENT_MESSAGES = 4;
const DECISION_MESSAGE_MAX_CHARS = 500;

/** Long messages (pasted drafts, long instructions) always go high without asking the decision model. */
const LONG_MESSAGE_CHARS = 800;

/** After a turn that needed depth or context, stay on the high tier for a while: follow-ups inherit it. */
const STICKY_TURNS = 8;
const STICKY_TTL_MS = 60 * 60 * 1000;

type ChatState = {
    result: PromptComplexityResult;
    stickyTurns: number;
    updatedAt: number;
}

// Per-process and best effort. After a restart the first message is simply classified again.
const chatState = new Map<string, ChatState>();

/** Clears the per-chat routing state. Only intended for tests. */
export function resetClassifierState(): void {
    chatState.clear();
}

export const DECISION_QUESTIONS: DecisionPredicate[] = [
    {
        name: "deep",
        instructions: "Would answering the latest user message well need real care or skill? Say yes for creative or long-form writing, fiction or manuscript work, editing or critiquing someone's writing, nuanced advice, analysis, planning, interpreting meaning or tone, anything involving judgment, and also code, math and science. Say no only for simple, self-contained requests.",
    },
    {
        name: "context",
        instructions: "Does the latest user message depend on earlier messages or on material the user shared earlier, such as a draft, document, story, character or ongoing project?",
    },
    {
        name: "casual",
        instructions: "Is the latest user message only a greeting, farewell, thanks, acknowledgment, reaction, emoji or small talk that needs no real work to answer?",
    },
    {
        name: "lookup",
        instructions: "Is the latest user message a short, self-contained factual question or simple request, such as a quick fact, definition, unit conversion or simple lookup?",
    },
];

/**
 * Chooses a model tier from the decision model's signals. Anything ambiguous goes to the high tier.
 */
export function chooseTier(signals: PromptSignals): { tier: PromptComplexity; sticky: boolean } {
    if (signals.deep >= DEEP_THRESHOLD || signals.context >= CONTEXT_THRESHOLD) {
        return { tier: "complex", sticky: true };
    }

    if (signals.casual >= NANO_MIN_CASUAL && signals.deep < NANO_MAX_DEEP && signals.context < NANO_MAX_CONTEXT) {
        return { tier: "trivial", sticky: false };
    }

    if (signals.lookup >= LOW_MIN_LOOKUP) {
        return { tier: "simple", sticky: false };
    }

    return { tier: "complex", sticky: false };
}

export async function classifyPromptComplexity(input: ClassifyPromptInput): Promise<PromptComplexityResult> {
    const decisionModel = Config.HENNOS_CLASSIFIER_DECISION_MODEL;
    if (!decisionModel) {
        return resultFor("complex");
    }

    const workflowId = Context.current().info.workflowExecution!.workflowId;
    const state = currentState(workflowId);

    // Mid tool-call loop: keep the model that was chosen for this turn instead of switching halfway.
    if (input.iterations > 0 || input.hasToolContext) {
        return state?.result ?? resultFor("complex");
    }

    const remainingSticky = state ? Math.max(0, state.stickyTurns - 1) : 0;

    try {
        const messages = await recentMessages(workflowId);
        const latest = messages.length > 0 ? messages[messages.length - 1] : undefined;

        if (!latest || latest.role !== "user" || latest.content.length >= LONG_MESSAGE_CHARS) {
            Logger.info(workflowId, "Prompt classified as 'complex' without a decision call (long, empty or non-text message)");
            return remember(workflowId, resultFor("complex"), true, remainingSticky);
        }

        const probabilities = await decidePredicates(
            {
                baseUrl: Config.LITELLM_BASE_URL,
                apiKey: Config.LITELLM_API_KEY,
                model: decisionModel,
                timeoutMs: DECISION_TIMEOUT_MS,
            },
            formatInput(messages),
            DECISION_QUESTIONS,
        );

        const signals = probabilities as PromptSignals;
        const { tier, sticky } = chooseTier(signals);

        // While a session is sticky, only ever move up.
        if (state && state.stickyTurns > 0 && tier !== "complex") {
            Logger.info(workflowId, `Prompt would be '${tier}' but the chat is sticky on the high tier (${state.stickyTurns} turns left). Signals: ${JSON.stringify(signals)}`);
            return remember(workflowId, resultFor("complex"), false, remainingSticky);
        }

        Logger.info(workflowId, `Prompt classified as '${tier}' by decision model ${decisionModel}. Signals: ${JSON.stringify(signals)}`);
        return remember(workflowId, resultFor(tier), sticky, remainingSticky);
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.warn(workflowId, `Decision classification failed, defaulting to 'complex': ${error.message}`);
        return remember(workflowId, resultFor("complex"), false, remainingSticky);
    }
}

function currentState(workflowId: string): ChatState | undefined {
    const state = chatState.get(workflowId);
    if (!state) {
        return undefined;
    }

    if (Date.now() - state.updatedAt > STICKY_TTL_MS) {
        chatState.delete(workflowId);
        return undefined;
    }

    return state;
}

function remember(workflowId: string, result: PromptComplexityResult, startSticky: boolean, remainingStickyTurns: number): PromptComplexityResult {
    if (chatState.size > 1000) {
        const cutoff = Date.now() - STICKY_TTL_MS;
        for (const [key, value] of chatState) {
            if (value.updatedAt < cutoff) {
                chatState.delete(key);
            }
        }
    }

    chatState.set(workflowId, {
        result,
        stickyTurns: startSticky ? STICKY_TURNS : remainingStickyTurns,
        updatedAt: Date.now(),
    });
    return result;
}

type RecentMessage = { role: string, content: string };

async function recentMessages(workflowId: string): Promise<RecentMessage[]> {
    const flow = parseWorkflowId(workflowId);
    const entries = await Database.instance().messages.findMany({
        where: { chatId: Number(flow.chatId), type: "text" },
        select: { role: true, content: true },
        orderBy: { id: "desc" },
        take: DECISION_RECENT_MESSAGES,
    });

    return entries.reverse();
}

function formatInput(messages: RecentMessage[]): string {
    const clip = (text: string) => text.length > DECISION_MESSAGE_MAX_CHARS ? `${text.slice(0, DECISION_MESSAGE_MAX_CHARS)}...` : text;
    const history = messages.slice(0, -1).map((entry) => `${entry.role}: ${clip(entry.content)}`);
    const latest = messages[messages.length - 1];

    return [
        history.length > 0 ? `Recent conversation:\n${history.join("\n")}` : "",
        `Latest user message:\n${clip(latest.content)}`,
    ].filter(Boolean).join("\n\n");
}

/**
 * Every tier uses the same context window and tool list, so the prompt prefix stays stable between turns
 * and only the upstream model changes.
 */
function resultFor(complexity: PromptComplexity): PromptComplexityResult {
    const contextLimit = Config.HENNOS_MEMORY_ENABLED ? 15 : 100;

    switch (complexity) {
        case "trivial":
            return { complexity, contextLimit, useTools: true, modelTier: "nano" };
        case "simple":
            return { complexity, contextLimit, useTools: true, modelTier: "low" };
        default:
            return { complexity: "complex", contextLimit, useTools: true, modelTier: "high" };
    }
}
