import { Config } from "../../singletons/config";
import { createTemporalClient } from "../../singletons/temporal";
import { usageByIdWorkflowQuery, usageWorkflow, usageWorkflowContinueAsNew, usageWorkflowQuery, usageWorkflowSignal } from "./workflow";
import { Logger } from "../../singletons/logger";

/**
 * This class should effectively act as a buffer for usage data, allowing us to batch signals to the
 * Temporal workflow and reduce the number of signals sent, which can help with performance and reduce costs.
 * 
 * The `init` method should be called to start the interval that checks for pending usage data and signals it to the workflow.
 * 
 * There are places in the code, like document processing, where we need to report usage in a fast sync way, and in those cases,
 * we can call the `signalUsage` method to add usage data to the buffer, which will then be signaled to the workflow at the next interval.
 */
export class UsageTracker {
    private static pendingUsage: { id: string, usage: Usage }[] = [];
    private static processing: boolean = false;
    private static intervalId: NodeJS.Timeout;

    public static init() {
        if (this.intervalId) {
            Logger.warn("UsageTracker", "UsageTracker is already initialized. Skipping initialization.");
            return;
        }

        Logger.info("UsageTracker", "Initializing UsageTracker and starting interval to signal usage to workflow.");
        this.intervalId = setInterval(() => {
            if (!this.processing && this.pendingUsage.length > 0) {
                this.processing = true;
                const usageToSignal = [...this.pendingUsage];
                this.pendingUsage = [];
                Logger.debug("UsageTracker", `Signaling usage to workflow: ${JSON.stringify(usageToSignal)}`);
                signalUsage(usageToSignal).finally(() => {
                    Logger.debug("UsageTracker", "Finished signaling usage to workflow.");
                    this.processing = false;
                });
            }
        }, 10 * 1000);
    }

    public static signalUsage(id: string, usage: Usage) {
        Logger.debug("UsageTracker", `Adding usage to buffer: id=${id}, usage=${JSON.stringify(usage)}`);
        this.pendingUsage.push({ id, usage });
    }
}

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

async function signalUsage(input: UsageWorkflowSignalInput[]) {
    try {
        const client = await createTemporalClient();
        await client.workflow.signalWithStart(usageWorkflow, {
            taskQueue: Config.TEMPORAL_TASK_QUEUE,
            workflowId: createWorkflowId(),
            args: [{}],
            signal: usageWorkflowSignal,
            signalArgs: input,
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