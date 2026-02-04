import { processToolCalls } from "../../../tools/tools";
import { ToolCallResponse } from "../../../tools/BaseTool";
import { Context } from "@temporalio/activity";

export async function action(
    toolName: string,
    input: unknown,
): Promise<string> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const toolCall = {
        function: {
            name: toolName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            arguments: input as { [key: string]: any },
        }
    };

    const results = await processToolCalls(workflowId, [[toolCall, null]]);

    const stringified: string[] = [];
    results.forEach((result: ToolCallResponse) => {
        if (result[0]) {
            stringified.push(result[0]);
        }

        if (result[2]) {
            if (result[2].__type === "string") {
                stringified.push(result[2].payload);
            }
        }
    });

    return stringified.join("\n");
}
