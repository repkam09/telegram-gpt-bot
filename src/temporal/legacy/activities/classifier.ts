import { Context } from "@temporalio/activity";
import { HennosTool, resolveModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { Database } from "../../../database";
import { parseWorkflowId } from "../interface";
import { Config } from "../../../singletons/config";

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

export async function classifyPromptComplexity(input: ClassifyPromptInput): Promise<PromptComplexityResult> {
    if (Config.HENNOS_LLM_PROVIDER === "ollama") {
        Logger.debug("PromptClassifier", "LLM provider is Ollama, skipping classification and defaulting to 'complex'");
        return complexResult();
    }

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
                Logger.info(workflowId, "Prompt classified as 'simple' by LLM tool call");
                return simpleResult();
            }

            if (toolName === CLASSIFY_TRIVIAL_TOOL) {
                Logger.info(workflowId, "Prompt classified as 'trivial' by LLM tool call");
                return trivialResult();
            }

            if (toolName === CLASSIFY_COMPLEX_TOOL) {
                Logger.info(workflowId, "Prompt classified as 'complex' by LLM tool call");
                return complexResult();
            }

            Logger.warn(workflowId, `Prompt classifier received unrecognized tool call: ${toolName}, defaulting to 'complex'`);

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


function trivialResult(): PromptComplexityResult {
    return {
        complexity: "trivial",
        contextLimit: 5,
        useTools: true,
        modelTier: "nano",
    };
}

function simpleResult(): PromptComplexityResult {
    return {
        complexity: "simple",
        contextLimit: 10,
        useTools: true,
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

const CLASSIFY_TRIVIAL_TOOL = "classify_trivial";
const CLASSIFY_SIMPLE_TOOL = "classify_simple";
const CLASSIFY_COMPLEX_TOOL = "classify_complex";

export function classifierToolDefinitions(): HennosTool[] {
    return [
        {
            type: "function",
            function: {
                name: CLASSIFY_TRIVIAL_TOOL,
                description: "Call this tool to classify the message as 'trivial' complexity.",
                parameters: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            },
        },
        {
            type: "function",
            function: {
                name: CLASSIFY_SIMPLE_TOOL,
                description: "Call this tool to classify the message as 'simple' complexity.",
                parameters: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            },
        },
        {
            type: "function",
            function: {
                name: CLASSIFY_COMPLEX_TOOL,
                description: "Call this tool to classify the message as 'complex' complexity.",
                parameters: {
                    type: "object",
                    properties: {},
                    required: [],
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
            "Your job is to decide whether a user message is \"trivial\", \"simple\", or \"complex\".",
            "",
            "You MUST call exactly one of the provided tools to report your classification.",
            "Call `classify_trivial` when the user message is simple, a greeting, farewell, acknowledgment, reaction, emoji, or casual small talk in any language. This is for messages that should be handled with the smallest and fastest model tier and do not require any tools or previous context to respond to.",
            "Call `classify_simple` when the user message is a basic question, request, or statement that does not require advanced reasoning or multiple rounds of tool use. This is for messages that can be handled with a low-tier model. Tools and limited context will be available to the Agent. ",
            "Call `classify_complex` when the user message is complex or requires advanced reasoning. This includes complex questions of science, physics, engineering, mathematics, references to prior conversation, other technical content, code, or multi-sentence instructions. This is for messages that should be handled with the highest-tier model. Tools and full context will be available to the Agent."
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
