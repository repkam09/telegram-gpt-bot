export type HennosAgenticResponse = HennosStringResponse | HennosActionResponse | HennosEmptyResponse;

export type HennosActionResponse = {
    __type: "action";
    payload: {
        name: string;
        input: Record<string, string>;
    };
}

export type HennosStringResponse = {
    __type: "string";
    payload: string;
}

export type HennosEmptyResponse = {
    __type: "empty";
}
