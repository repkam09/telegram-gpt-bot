import { resolveModelProvider } from "../../../provider";
import { Context } from "@temporalio/activity";

export type ObservationInput = {
    context: string[],
    actionResult: string,
}

export type ObservationResult = {
    observations: string;
}

export async function observation(input: ObservationInput
): Promise<ObservationResult> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const model = resolveModelProvider("low");
    const promptTemplate = observationPromptTemplate({
        previousSteps: input.context.join("\n"),
        actionResult: input.actionResult,
    });

    const response = await model.invoke(workflowId, [
        { role: "user", content: promptTemplate, type: "text" },
    ]);
    return {
        observations: response.payload,
    };
}

type ObservationPromptInput = {
    previousSteps: string,
    actionResult: string,
}

export function observationPromptTemplate({ actionResult, previousSteps }: ObservationPromptInput): string {
    return `You are a ReAct (Reasoning and Acting) agent named Hennos tasked with assisting a user.
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
