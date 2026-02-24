import { Tool } from "ollama";
import { Config } from "./singletons/config";
import { HennosOllamaSingleton } from "./singletons/ollama";
import { HennosOpenAISingleton } from "./singletons/openai";
import { HennosAnthropicSingleton } from "./singletons/anthropic";

export type HennosTool = Tool;
export type HennosInvokeResponse = HennosInvokeStringResponse | HennosInvokeToolResponse;

export type HennosInvokeToolResponse = {
    __type: "tool";
    payload: {
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

export type CompletionContextEntry = CompletionContextTextEntry | CompletionContextToolCallEntry | CompletionContextToolResponseEntry;

export type CompletionContextTextEntry = {
    role: "user" | "assistant" | "system";
    content: string;
}

export type CompletionContextToolCallEntry = {
    role: "tool_call";
    name: string;
    input: Record<string, string>;
    id: string;
}

export type CompletionContextToolResponseEntry = {
    role: "tool_response";
    id: string;
    result: string;
}

export type CompletionResponse = CompletionResponseString | CompletionResponseTool;
export type CompletionResponseString = {
    __type: "string";
    payload: string;
}

export type CompletionResponseTool = {
    __type: "tool";
    payload: {
        name: string;
        input: Record<string, string>;
        id: string;
    };
}

type InvokableModelProvider = {
    invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse>;
    completion(workflowId: string, messages: CompletionContextEntry[], iterations: number, tools?: HennosTool[]): Promise<CompletionResponse>;
    moderation(workflowId: string, input: string): Promise<boolean>;
}

export function resolveModelProvider(level: "high" | "low"): InvokableModelProvider {
    switch (Config.HENNOS_LLM_PROVIDER) {
        case "openai": {
            if (level === "high") {
                return HennosOpenAISingleton.high();
            }
            return HennosOpenAISingleton.low();
        }

        case "anthropic": {
            if (level === "high") {
                return HennosAnthropicSingleton.high();
            }
            return HennosAnthropicSingleton.low();
        }

        case "ollama": {
            return HennosOllamaSingleton.high();
        }

        default: {
            throw new Error(`Unsupported model provider: ${Config.HENNOS_LLM_PROVIDER}`);
        }
    }
}