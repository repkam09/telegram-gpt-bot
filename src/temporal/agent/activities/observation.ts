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
    return `Take the contents of the <action-result> section below, keeping in mind the overall <conversation-context>, and generate a list of concise and relevant bullet points that capture the key facts and insights from the action result.
These bullet points should be focused on extracting useful information that can guide the agent's next steps in addressing the user's query. Only output the bullet points, without any additional commentary or explanation.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response. Just provide the bullet points in plain text format.

Here is the context of the current conversation:
<conversation-context>
${previousSteps}
</conversation-context>

Here is the result of the last action taken by the agent:
<action-result>
${actionResult}
</action-result>`;
}
