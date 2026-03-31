import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { usageByIdWorkflowQuery, usageWorkflow, usageWorkflowContinueAsNew, usageWorkflowQuery, usageWorkflowSignal } from "./workflow";

export type Usage = {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
}

export type UsageWorkflowSignalInput = {
    id: string;
    usage: Usage;
}

export function createWorkflowId(): string {
    return "global-usage-tracking-workflow";
}

export async function signalUsage(id: string, usage: Usage) {
    try {
        const client = await createTemporalClient();
        await client.workflow.signalWithStart(usageWorkflow, {
            taskQueue: Config.TEMPORAL_TASK_QUEUE,
            workflowId: createWorkflowId(),
            args: [{}],
            signal: usageWorkflowSignal,
            signalArgs: [{
                id,
                usage
            }],
        });
    } catch (err) {
        console.error("Error signaling usage workflow:", err);
    }
}

export async function signalUsageContinueAsNew() {
    try {
        const client = await createTemporalClient();
        await client.workflow.signalWithStart(usageWorkflow, {
            taskQueue: Config.TEMPORAL_TASK_QUEUE,
            workflowId: createWorkflowId(),
            args: [{}],
            signal: usageWorkflowContinueAsNew,
        });
    } catch (err) {
        console.error("Error signaling usage workflow to continue as new:", err);
    }
}

export async function queryUsage(): Promise<{ id: string; usage: Usage }[]> {
    try {
        const client = await createTemporalClient();
        const workflowId = createWorkflowId();
        const handle = await client.workflow.getHandle(workflowId);
        const result = await handle.query(usageWorkflowQuery);
        return result;
    } catch (err) {
        console.error("Error querying usage workflow:", err);
    }
    return [];
}

export async function queryUsageById(id: string): Promise<Usage | undefined> {
    try {
        const client = await createTemporalClient();
        const workflowId = createWorkflowId();
        const handle = await client.workflow.getHandle(workflowId);
        const result = await handle.query(usageByIdWorkflowQuery, id);
        return result;
    } catch (err) {
        console.error("Error querying usage workflow by ID:", err);
    }
    return undefined;
}