export type HennosAgenticResponse = HennosStringResponse | HennosActionResponse | HennosEmptyResponse | HennosInternalThoughtResponse;

export type HennosActionResponse = {
    __type: "action";
    payload: {
        name: string;
        input: Record<string, string>;
    };
}

export type HennosInternalThoughtResponse = {
    __type: "internal_thought";
    payload: string;
}

export type HennosStringResponse = {
    __type: "string";
    payload: string;
}

export type HennosEmptyResponse = {
    __type: "empty";
}
