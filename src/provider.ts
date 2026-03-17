import { Tool } from "ollama";
import { Config, HennosModelProvider } from "./singletons/config";
import { HennosOllamaSingleton } from "./singletons/ollama";
import { HennosOpenAISingleton } from "./singletons/openai";
import { HennosAnthropicSingleton } from "./singletons/anthropic";
import { Logger } from "./singletons/logger";
import { Database } from "./database";
import { parseWorkflowId as parseLegacyWorkflowId } from "./temporal/legacy/interface";

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
    moderation(workflowId: string, input: string): Promise<boolean>;
}

export function resolveModelProvider(level: "high" | "low" | "nano"): InvokableModelProvider {
    return internalResolveModelProvider(level, Config.HENNOS_LLM_PROVIDER);
}

function internalResolveModelProvider(level: "high" | "low" | "nano", provider: HennosModelProvider): InvokableModelProvider {
    switch (provider) {
        case "openai": {
            if (level === "high") {
                return HennosOpenAISingleton.high();
            }

            if (level === "low") {
                return HennosOpenAISingleton.low();
            }

            if (level === "nano") {
                return HennosOpenAISingleton.nano();
            }
            throw new Error(`Unsupported model tier for OpenAI provider: ${level}`);
        }

        case "anthropic": {
            if (level === "high") {
                return HennosAnthropicSingleton.high();
            }

            if (level === "low") {
                return HennosAnthropicSingleton.low();
            }

            if (level === "nano") {
                // For simplicity, just use the OpenAI nano model here as well
                return HennosOpenAISingleton.nano();
            }
            throw new Error(`Unsupported model tier for Anthropic provider: ${level}`);
        }

        case "ollama": {
            return HennosOllamaSingleton.high();
        }

        default: {
            throw new Error(`Unsupported model provider: ${Config.HENNOS_LLM_PROVIDER}`);
        }
    }
}

export async function resolveLegacyModelProvider(workflowId: string, level: "high" | "low" | "nano"): Promise<InvokableModelProvider> {
    try {
        const parsed = parseLegacyWorkflowId(workflowId);
        const database = Database.instance();
        const user = await database.user.findUnique({
            where: {
                chatId: Number(parsed.chatId)
            },
            select: {
                provider: true
            }
        });

        if (!user || !user.provider) {
            Logger.debug(workflowId, `No user provider found for workflowId '${workflowId}', falling back to default provider '${Config.HENNOS_LLM_PROVIDER}'`);
            return resolveModelProvider(level);
        }
        Logger.debug(workflowId, `Resolved legacy model provider for level '${level}' to user provider '${user.provider}'`);
        return internalResolveModelProvider(level, user.provider as HennosModelProvider);
    } catch (err) {
        Logger.error(workflowId, `Failed to resolve legacy model provider for level '${level}': ${err}`);
        return resolveModelProvider(level);
    }
}