import { Tool } from "ollama";
import { Config } from "./singletons/config";
import { HennosOllamaSingleton } from "./singletons/ollama";
import { Logger } from "./singletons/logger";
import { HennosLiteLLMSingleton } from "./singletons/litellm";

export type HennosTool = Tool;
export type HennosInvokeResponse = HennosInvokeStringResponse | HennosInvokeToolResponse;

export type HennosInvokeToolResponse = {
    __type: "tool";
    payload: {
        name: string;
        input: string;
    }[];
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

export type CompletionContextEntry = CompletionContextTextEntry | CompletionContextToolCallEntry | CompletionContextToolResponseEntry | CompletionContextImageEntry;

export type CompletionContextTextEntry = {
    role: "user" | "assistant" | "system";
    content: string;
}

export type CompletionContextImage = {
    local: string;
    mime: string;
}

export type CompletionContextEncodedImage = {
    __type: "b64_image";
    data: string;
}

export type CompletionContextImageEntry = {
    role: "user" | "assistant" | "system";
    image: CompletionContextImage;
    encoded: CompletionContextEncodedImage;
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
    }[];
}

type InvokableModelProvider = {
    limit(): number;
    invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse>;
    completion(workflowId: string, messages: CompletionContextEntry[], iterations: number, tools?: HennosTool[]): Promise<CompletionResponse>;
}

export async function resolveModelProvider(workflowId: string, level: "high" | "low" | "nano"): Promise<InvokableModelProvider> {
    Logger.debug("ModelProviderResolution", `Resolving model provider for level '${level}' and provider '${Config.HENNOS_LLM_PROVIDER}'`);
    switch (Config.HENNOS_LLM_PROVIDER) {
        case "litellm": {
            if (level === "high") {
                return await HennosLiteLLMSingleton.high(workflowId);

            }

            if (level === "low") {
                return await HennosLiteLLMSingleton.low(workflowId);
            }

            return await HennosLiteLLMSingleton.nano(workflowId);
        }

        case "ollama": {
            return HennosOllamaSingleton.high();
        }

        default: {
            throw new Error(`Unsupported model provider: ${Config.HENNOS_LLM_PROVIDER}`);
        }
    }
}
