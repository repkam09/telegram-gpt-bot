import { processToolCalls } from "../../../tools/tools";
import { ToolCallResponse } from "../../../tools/BaseTool";
import { Context } from "@temporalio/activity";

export async function action(
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

    const results = await processToolCalls(workflowId, [[toolCall, null]]);

    const stringified: string[] = [];
    results.forEach((result: ToolCallResponse) => {
        if (result[0]) {
            stringified.push(result[0]);
        }
    });

    return stringified.join("\n");
}
