export type UsageMetadata = {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
}

export type HennosWorkflowUser = {
    userId: {
        __typename: "HennosWorkflowUserId";
        value: string;
    },
    displayName: string;
    isAdmin: boolean;
    isExperimental: boolean;
    isWhitelisted: boolean;
    provider: "openai";
}