import { Logger } from "./singletons/logger";
import { HennosLiteLLMSingleton } from "./singletons/litellm";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Tool definitions use the OpenAI/LiteLLM function-calling JSON schema shape.
export type HennosToolProperty = {
    type?: string | string[];
    items?: any;
    description?: string;
    enum?: any[];
}

export type HennosTool = {
    type?: string;
    function: {
        name?: string;
        description?: string;
        type?: string;
        parameters?: {
            type?: string;
            $defs?: any;
            items?: any;
            required?: string[];
            properties?: { [key: string]: HennosToolProperty };
        };
    };
}

export type HennosToolCall = {
    function: {
        name: string;
        arguments: { [key: string]: any };
    };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
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
    Logger.debug("ModelProviderResolution", `Resolving LiteLLM model provider for level '${level}'`);

    if (level === "high") {
        return await HennosLiteLLMSingleton.high(workflowId);
    }

    if (level === "low") {
        return await HennosLiteLLMSingleton.low(workflowId);
    }

    return await HennosLiteLLMSingleton.nano(workflowId);
}
