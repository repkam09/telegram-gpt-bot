import { Tool } from "ollama";
import { Config } from "./singletons/config";
import { HennosOllamaSingleton } from "./singletons/ollama";
import { HennosOpenAISingleton } from "./singletons/openai";

export type HennosTool = Tool;
export type HennosInvokeResponse = HennosInvokeStringResponse | HennosInvokeToolResponse;

export type HennosInvokeToolResponse = {
    __type: "tool";
    payload: {
        uuid: string;
        name: string;
        input: string;
    };
}

export type HennosInvokeStringResponse = {
    __type: "string";
    payload: string;
}

export type HennosMessage = {
    type: "text";
    role: "user" | "assistant" | "system";
    content: string;
}


type InvokableModelProvider = {
    invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse>;
    moderation(workflowId: string, input: string): Promise<boolean>;
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