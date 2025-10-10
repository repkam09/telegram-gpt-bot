export type HennosWorkflowProvider = "openai" | "anthropic";

/**
{
  "user": {
    "userId": "repkam09",
    "provider": "openai",
    "isAdmin": true,
    "isExperimental": true,
    "isWhitelisted": true
  }
}
*/

export type HennosWorkflowUser = {
    userId: HennosWorkflowUserId;
    provider: HennosWorkflowProvider;
    isAdmin: boolean;
    isExperimental: boolean;
    isWhitelisted: boolean;
};

export type HennosWorkflowUserId = {
    value: string;
    __typename: "HennosWorkflowUserId";
};