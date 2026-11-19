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

/**
 * Hennos only talks to LiteLLM (or Ollama), and LiteLLM picks the upstream model itself, so there is no
 * client-side model tier to choose anymore. Every prompt is treated as 'complex'.
 *
 * This stays an activity, even though it no longer does any work, so the order and number of activity
 * calls in `legacyWorkflow` is unchanged for workflows that are already running.
 */
export async function classifyPromptComplexity(_input: ClassifyPromptInput): Promise<PromptComplexityResult> {
    return complexResult();
}

function complexResult(): PromptComplexityResult {
    if (Config.HENNOS_MEMORY_ENABLED) {
        return {
            complexity: "complex",
            contextLimit: 15,
            useTools: true,
            modelTier: "high",
        };
    }
    return {
        complexity: "complex",
        contextLimit: 100,
        useTools: true,
        modelTier: "high",
    };
}
