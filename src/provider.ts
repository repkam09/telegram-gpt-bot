import { Config } from "./singletons/config";
import { HennosOllamaSingleton } from "./singletons/ollama";
import { HennosOpenAISingleton } from "./singletons/openai";
import { HennosStringResponse } from "./types";

type InvokableModelProvider = {
    invoke(workflowId: string, messages: unknown[], schema?: boolean): Promise<HennosStringResponse>;
    moderation?(workflowId: string, input: string): Promise<boolean>;
}

export function resolveModelProvider(level: "high" | "low"): InvokableModelProvider {
    switch (Config.HENNOS_LLM_PROVIDER) {
        case "openai": {
            if (level === "high") {
                return HennosOpenAISingleton.instance();
            }
            return HennosOpenAISingleton.mini();
        }

        case "ollama": {
            return HennosOllamaSingleton.instance();
        }

        default: {
            throw new Error(`Unsupported model provider: ${Config.HENNOS_LLM_PROVIDER}`);
        }
    }
}