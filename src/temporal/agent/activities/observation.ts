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

    if (response.__type !== "string") {
        throw new Error("Unexpected response type from model during observation: " + response.__type);
    }

    return {
        observations: response.payload,
    };
}

type ObservationPromptInput = {
    previousSteps: string,
    actionResult: string,
}

export function observationPromptTemplate({ actionResult, previousSteps }: ObservationPromptInput): string {
    return `You are a part of a ReAct (Reasoning and Acting) agent named Hennos tasked with assisting a user. The 'Action' step has just been completed and you are the 'Observation' step.
Your job is to take the results of the last action, along with the recent conversation context, and generate observations that will help the agent make informed decisions in the next 'Thought' step.
You should output bullet points of facts and insights based on the action result. Keep your points concise and relevant to the task at hand. Focus on extracting useful information that can guide the agent's next steps.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response, those will be added automatically by the Agent Workflow.

Here are the last few parts of the conversation and the result of the last action taken:
<conversation-context>
${previousSteps}
</conversation-context>

Here is the result of the last action taken:
<action-result>
${actionResult}
</action-result>`;
}
