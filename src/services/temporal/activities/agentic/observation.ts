import { HennosUserFromWorkflowUser } from "../../../../singletons/consumer";
import { HennosOpenAISingleton } from "../../../../singletons/llms/openai";
import { HennosWorkflowUser } from "../../common/types";

type ObservationResult = {
    observations: string
}

export async function observation(
    userDetails: HennosWorkflowUser,
    context: string[],
    actionResult: string,
): Promise<ObservationResult> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const model = HennosOpenAISingleton.mini();

    const promptTemplate = observationPromptTemplate({
        userDetails: userDetails,
        previousSteps: context.join("\n"),
        actionResult: actionResult,
    });

    const response = await model.invoke(req, [
        { role: "user", content: promptTemplate, type: "text" },
    ], [undefined, undefined, undefined]);

    if (response.__type !== "message") {
        throw new Error("Invalid response type from observation activity");
    }

    return {
        observations: response.payload,
    };
}

type ObservationPromptInput = {
    userDetails: HennosWorkflowUser,
    previousSteps: string,
    actionResult: string,
}

export function observationPromptTemplate({ actionResult, previousSteps, userDetails }: ObservationPromptInput): string {
    return `You are a ReAct (Reasoning and Acting) agent named Hennos tasked with assisting a user 
    
Here is the user's information:
<user-info>
${userDetails.displayName}
</user-info>

Your goal is to extract insights from the results of your last action and provide a concise observation.

Instructions:
1. Analyze the context, previous reasoning steps, and observations.
2. Extract insights from the latest action result.
3. Respond with a concise observation that summarizes the results of the last action taken.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response, those will be added automatically by the Agent Workflow.

In this observation step, consider the following information from previous steps:

<previous-steps>
${previousSteps}
</previous-steps>

Provide your observation based on the latest action result:
<action-result>
${actionResult}
</action-result>`;
}
