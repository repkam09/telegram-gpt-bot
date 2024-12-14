export type HennosResponse = HennosStringResponse | HennosEmptyResponse | HennosArrayBufferResponse | HennosErrorResponse;

export type HennosMessageRole = "user" | "assistant" | "system";
export type HennosTextMessage = {
    type: "text",
    role: HennosMessageRole,
    content: string,
}

type HennosImageMessage = {
    type: "image",
    role: HennosMessageRole,
    image: HennosImage,
    encoded: string
}

export type HennosMessage = HennosTextMessage | HennosImageMessage;

export type HennosErrorResponse = {
    __type: "error"
    payload: string
}

export type HennosStringResponse = {
    __type: "string"
    payload: string
}

export type HennosEmptyResponse = {
    __type: "empty"
}

export type HennosArrayBufferResponse = {
    __type: "arraybuffer"
    payload: ArrayBuffer
}

export const ValidLLMProviders = ["openai", "ollama", "anthropic", "google", "mock"] as const;
export type ValidLLMProvider = typeof ValidLLMProviders[number];


export const ValidTTSNames = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type ValidTTSName = typeof ValidTTSNames[number];

export type HennosImage = {
    local: string,
    mime: string
}