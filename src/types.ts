export type HennosTextMessage = {
    type: "text";
    role: "user" | "assistant" | "system";
    content: string;
}

export type HennosStringResponse = {
    __type: "string";
    payload: string;
}

export type HennosEmptyResponse = {
    __type: "empty";
}

export type HennosResponse = HennosStringResponse | HennosEmptyResponse;