export type GemstoneAgenticResponse = GemstoneStringResponse | GemstoneActionResponse;

export type GemstoneActionResponse = {
    __type: "action";
    payload: {
        name: string;
        input: Record<string, string>;
    };
}

export type GemstoneStringResponse = {
    __type: "string";
    payload: string;
}
