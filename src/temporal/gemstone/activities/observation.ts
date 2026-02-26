import { resolveModelProvider } from "../../../provider";
import { Context } from "@temporalio/activity";
import { GemstoneAgentContext } from "../interface";

export type GemstoneObservationInput = {
    context: GemstoneAgentContext[],
    actionResult: string,
}

export type GemstoneObservationResult = {
    observations: string;
}

export async function gemstoneObservation(input: GemstoneObservationInput
): Promise<GemstoneObservationResult> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const model = resolveModelProvider("low");
    const promptTemplate = gemstoneObservationPromptTemplate({
        previousSteps: input.context.map(entry => `${entry.role}: ${entry.content}`).join("\n"),
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

type GemstoneObservationPromptInput = {
    previousSteps: string,
    actionResult: string,
}

export function gemstoneObservationPromptTemplate({ actionResult, previousSteps }: GemstoneObservationPromptInput): string {
    return `Take the contents of the <action-result> section below, keeping in mind the overall <conversation-context>, and generate a list of concise and relevant bullet points that capture the key facts and insights from the action result.
These bullet points should be focused on extracting useful information that can guide the agent's next steps in addressing the user's query. Only output the bullet points, without any additional commentary or explanation.

Here is the context of the current conversation:
<conversation-context>
${previousSteps}
</conversation-context>

Here is the result of the last action taken by the agent:
<action-result>
${actionResult}
</action-result>`;
}
