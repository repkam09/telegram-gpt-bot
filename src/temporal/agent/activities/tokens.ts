import { Logger } from "../../../singletons/logger";
import { encoding_for_model } from "tiktoken";
import { Context } from "@temporalio/activity";

export async function tokens(
    context: string[],
): Promise<{
    tokenCount: number;
    tokenLimit: number;
}> {
        const workflowId = Context.current().info.workflowExecution.workflowId;
    
    Logger.debug(workflowId, `Counting tokens for ${context.length} messages`);

    const result = await getChatContextTokenCount(context);
    return {
        tokenCount: result,
        tokenLimit: 16000,
    };
}

function getChatContextTokenCount(context: string[]): number {
    const encoder = encoding_for_model("gpt-4o-mini");
    const total = context.reduce((acc: number, val: string) => {
        const tokens = encoder.encode(val).length;
        return acc + tokens;
    }, 0);

    encoder.free();
    return total;
}