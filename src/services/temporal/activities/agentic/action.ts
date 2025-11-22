import { HennosUserFromWorkflowUser } from "../../../../singletons/consumer";
import { ToolCallResponse } from "../../../../tools/BaseTool";
import { processToolCalls } from "../../../../tools/tools";
import { HennosWorkflowUser } from "../../common/types";

export async function action(
    userDetails: HennosWorkflowUser,
    toolName: string,
    input: unknown,
): Promise<string> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const toolCall = {
        function: {
            name: toolName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            arguments: input as { [key: string]: any },
        }
    };

    const results = await processToolCalls(req, [[toolCall, null]]);

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
