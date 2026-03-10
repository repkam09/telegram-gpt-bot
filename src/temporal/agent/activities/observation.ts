import { resolveModelProvider } from "../../../provider";
import { Context } from "@temporalio/activity";
import { withActivityHeartbeat } from "../../heartbeat";

export type ObservationInput = {
    actionName: string,
    actionInput: Record<string, string>,
    actionResult: string,
    reason: string
}

export type ObservationResult = {
    observations: string;
}

export const observation = withActivityHeartbeat(_observation);
async function _observation(input: ObservationInput
): Promise<ObservationResult> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const model = resolveModelProvider("low");
    const promptTemplate = observationPromptTemplate({
        actionName: input.actionName,
        actionInput: input.actionInput,
        reason: input.reason,
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
    actionName: string,
    actionInput: Record<string, string>,
    reason: string,
    actionResult: string,
}

export function observationPromptTemplate({ actionName, actionInput, reason, actionResult }: ObservationPromptInput): string {
    return `Take the contents of the <action-result> section below, keeping in mind the reason in <action-reason>,
and generate a list of concise and relevant bullet points that capture the key facts and insights from the action result.
These bullet points should be focused on extracting useful information that can guide the agent's next steps in addressing the user's query.
Only output the bullet points, without any additional commentary or explanation.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response. Just provide the bullet points in plain text format.

Here is information about the action that was taken by the agent:
<action>
<name>${actionName}</name>
<reason>${reason}</reason>
<input>
${JSON.stringify(actionInput, null, 2)}
</input>
</action>

Here is the result of the action taken by the agent:
<action-result>
${actionResult}
</action-result>`;
}
