import { processDefinedToolCalls } from "../../../tools/tools";
import { ToolCallResponse } from "../../../tools/BaseTool";
import { Context } from "@temporalio/activity";
import { availableTools } from "../tools";

export async function legacyAction(
    toolName: string,
    input: Record<string, string>
): Promise<string> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const toolCall = {
        function: {
            name: toolName,
            arguments: input,
        }
    };

    const tools = availableTools(workflowId);
    const results = await processDefinedToolCalls(workflowId, tools ? tools : [], [[toolCall, null]]);

    const stringified: string[] = [];
    results.forEach((result: ToolCallResponse) => {
        if (result[0]) {
            stringified.push(result[0]);
        }
    });

    return stringified.join("\n");
}
