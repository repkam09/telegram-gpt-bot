import { Context } from "@temporalio/activity";
import { HennosTool, resolveModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { Database } from "../../../database";
import { parseWorkflowId } from "../interface";

export type PromptComplexity = "simple" | "complex";

export type PromptComplexityResult = {
    complexity: PromptComplexity;
    contextLimit: number;
    useTools: boolean;
    modelTier: "high" | "low";
}

export type ClassifyPromptInput = {
    iterations: number;
    hasToolContext: boolean;
}

export async function classifyPromptComplexity(input: ClassifyPromptInput): Promise<PromptComplexityResult> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    // Fast path: already in a tool-call loop — no LLM call needed
    if (input.iterations > 0 || input.hasToolContext) {
        Logger.debug(workflowId, "Prompt classified as 'complex' (in tool-call loop, skipped LLM classification)");
        return complexResult();
    }

    const latestUserMessage = await getLatestUserMessage(workflowId);

    // Fast path: empty message
    if (latestUserMessage.trim().length === 0) {
        Logger.debug(workflowId, "Prompt classified as 'simple' (empty message, skipped LLM classification)");
        return simpleResult();
    }

    // Use a cheap/fast model with forced tool-call output for structured classification
    const model = resolveModelProvider("nano");
    const prompt = classifierPromptTemplate(latestUserMessage);
    const tools = classifierToolDefinitions();

    try {
        const response = await model.invoke(workflowId, [
            { role: "system", content: prompt.system, type: "text" },
            { role: "user", content: prompt.user, type: "text" },
        ], tools);

        if (response.__type === "tool") {
            const payload = response.payload[0];
            const toolName = payload.name;
            Logger.debug(workflowId, `Prompt classified by LLM tool call: ${toolName} (input: ${payload.input})`);

            if (toolName === CLASSIFY_SIMPLE_TOOL) {
                return simpleResult();
            }

            // classify_complex or any unrecognized tool name, just return complex
            return complexResult();
        }

        // Model returned a string instead of calling a tool, just fall back to complex
        Logger.debug(workflowId, "Prompt classifier: LLM returned text instead of tool call, defaulting to 'complex'");
        return complexResult();
    } catch (err: unknown) {
        // If classification fails, default to complex and log the error for monitoring
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.warn(workflowId, `Prompt classification failed, defaulting to 'complex': ${error.message}`);
        return complexResult();
    }
}

function simpleResult(): PromptComplexityResult {
    return {
        complexity: "simple",
        contextLimit: 3,
        useTools: false,
        modelTier: "low",
    };
}

function complexResult(): PromptComplexityResult {
    return {
        complexity: "complex",
        contextLimit: 100,
        useTools: true,
        modelTier: "high",
    };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

const CLASSIFY_SIMPLE_TOOL = "classify_simple";
const CLASSIFY_COMPLEX_TOOL = "classify_complex";

export function classifierToolDefinitions(): HennosTool[] {
    return [
        {
            type: "function",
            function: {
                name: CLASSIFY_SIMPLE_TOOL,
                description: "Call this tool when the user message is simple.",
                parameters: {
                    type: "object",
                    properties: {
                        reason: {
                            type: "string",
                            description: "A brief reason why this message is classified as simple.",
                        },
                    },
                    required: ["reason"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: CLASSIFY_COMPLEX_TOOL,
                description: "Call this tool when the user message is complex.",
                parameters: {
                    type: "object",
                    properties: {
                        reason: {
                            type: "string",
                            description: "A brief reason why this message is classified as complex.",
                        },
                    },
                    required: ["reason"],
                },
            },
        },
    ];
}

// ─── Prompt Template ────────────────────────────────────────────────────────

type ClassifierPrompt = {
    system: string;
    user: string;
}

export function classifierPromptTemplate(userMessage: string): ClassifierPrompt {
    return {
        system: [
            "You are a message classifier for a conversational AI assistant.",
            "Your job is to decide whether a user message is \"simple\" or \"complex\".",
            "",
            "You MUST call exactly one of the provided tools to report your classification.",
            "Call `classify_simple` if the message is a greeting, farewell, acknowledgment, reaction, emoji, or casual small talk in any language.",
            "Call `classify_complex` if the message asks a question, requests an action, references prior conversation, contains technical content, code, URLs, or multi-sentence instructions.",
            "When in doubt, call `classify_complex`.",
        ].join("\n"),
        user: userMessage,
    };
}

async function getLatestUserMessage(workflowId: string): Promise<string> {
    const flow = parseWorkflowId(workflowId);
    const db = Database.instance();

    const entry = await db.messages.findFirst({
        where: {
            chatId: Number(flow.chatId),
            role: "user",
            type: "text",
        },
        select: {
            content: true,
        },
        orderBy: {
            id: "desc"
        },
    });

    return entry?.content ?? "";
}
