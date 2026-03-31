import { condition, continueAsNew, defineQuery, defineSignal, setHandler, workflowInfo } from "@temporalio/workflow";
import type { Usage, UsageWorkflowSignalInput } from "./interface";

type UsageWorkflowInput = {
    continueAsNew?: {
        usage: Map<string, Usage>;
    }
}

export const usageWorkflowContinueAsNew = defineSignal("usageWorkflowContinueAsNew");
export const usageWorkflowSignal = defineSignal<[UsageWorkflowSignalInput]>(
    "usageWorkflowSignal",
);
export const usageWorkflowQuery = defineQuery<{ id: string; usage: Usage }[], []>(
    "usageWorkflowQuery",
);

export const usageByIdWorkflowQuery = defineQuery<Usage | undefined, [string]>(
    "usageByIdWorkflowQuery",
);

export async function usageWorkflow(input: UsageWorkflowInput): Promise<void> {

    const usage: Map<string, Usage> = input.continueAsNew
        ? input.continueAsNew.usage
        : new Map();

    let userRequestedContinueAsNew = false;

    setHandler(usageWorkflowSignal, (input: UsageWorkflowSignalInput) => {
        if (usage.has(input.id)) {
            const existingUsage = usage.get(input.id)!;
            existingUsage.inputTokens += input.usage.inputTokens;
            existingUsage.outputTokens += input.usage.outputTokens;
            existingUsage.reasoningTokens += input.usage.reasoningTokens;
            existingUsage.totalTokens += input.usage.totalTokens;
        } else {
            usage.set(input.id, input.usage);
        }
    });

    setHandler(usageWorkflowContinueAsNew, () => {
        userRequestedContinueAsNew = true;
    });

    setHandler(usageByIdWorkflowQuery, (id: string) => {
        return usage.get(id);
    });

    setHandler(usageWorkflowQuery, () => {
        const result: { id: string; usage: Usage }[] = [];
        for (const key of usage.keys()) {
            result.push({ id: key, usage: usage.get(key)! });
        }
        return result;
    });

    await condition(() => userRequestedContinueAsNew || workflowInfo().continueAsNewSuggested);
    return continueAsNew<typeof usageWorkflow>({
        continueAsNew: {
            usage,
        },
    });

}