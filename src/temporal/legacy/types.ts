export type LegacyAgenticResponse = LegacyStringResponse | LegacyActionResponse;

export type LegacyActionResponse = {
    __type: "action";
    payload: {
        name: string;
        input: Record<string, string>;
        id: string;
    }[];
}

export type LegacyStringResponse = {
    __type: "string";
    payload: string;
}

export type LegacyResponseStreamEvent = {
    type: "delta";
    responseId: number;
    text: string;
} | {
    type: "retry";
    responseId: number;
} | {
    type: "close";
    responseId: number;
};
