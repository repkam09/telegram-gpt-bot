import {
    condition,
    continueAsNew,
    defineQuery,
    defineSignal,
    proxyActivities,
    setHandler,
    workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";

export function createWorkflowId(platform: string, data: object): string {
    const payload = JSON.stringify({
        platform,
        ...data,
    });
    return Buffer.from(payload).toString("base64");
}

export function parseWorkflowId(workflowId: string): { platform: string;[key: string]: unknown } {
    const decoded = Buffer.from(workflowId, "base64").toString("utf-8");
    return JSON.parse(decoded);
}

const { action, persistUserMessage, persistAgentMessage, tokens } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { thought } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { compact, observation } = proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

type PendingMessage = {
    author: string;
    message: string;
    date: string;
}

export type AgentWorkflowInput = {
    continueAsNew?: {
        context: string[];
        pending: PendingMessage[];
        activeAuthor: string | null;
        userRequestedExit: boolean;
    };
};

export const agentWorkflowQueryContext = defineQuery<string[]>("agentWorkflowQueryContext");

export const agentWorkflowMessageSignal = defineSignal<[string, string, string]>(
    "agentWorkflowMessage",
);

export const agentWorkflowExternalContextSignal = defineSignal<[string, string, string]>(
    "agentWorkflowExternalContext",
);

export const agentWorkflowExternalArtifactSignal = defineSignal<[string, string, string, string]>(
    "agentWorkflowExternalArtifact",
);

export const agentWorkflowExitSignal = defineSignal("agentWorkflowExit");
export const agentWorkflowContinueAsNew = defineSignal("agentWorkflowContinueAsNew");
export const agentWorkflowClearContext = defineSignal("agentWorkflowClearContext");

export async function agentWorkflow(input: AgentWorkflowInput): Promise<void> {
    let context: string[] = input.continueAsNew
        ? input.continueAsNew.context
        : [];

    const pending: PendingMessage[] = input.continueAsNew
        ? input.continueAsNew.pending
        : [];

    let userRequestedExit = input.continueAsNew
        ? input.continueAsNew.userRequestedExit
        : false;

    let userRequestedContinueAsNew = false;

    const activeAuthor: string | null = input.continueAsNew
        ? input.continueAsNew.activeAuthor
        : null;

    setHandler(agentWorkflowMessageSignal, (message: string, author: string, date: string) => {
        pending.push({
            message,
            author,
            date,
        });
    });

    setHandler(agentWorkflowExternalContextSignal, (content: string, author: string, date: string) => {
        context.push(`<external_context date="${date}" author="${author}">\n${content}\n</external_context>`);
    });

    setHandler(agentWorkflowExternalArtifactSignal, (ref: string, description: string, mimetype: string, date: string) => {
        context.push(`<external_artifact date="${date}" mimetype="${mimetype}" id="${ref}">\n<description>\n${description}\n</description>\n</external_artifact>`);
    });

    setHandler(agentWorkflowExitSignal, () => {
        userRequestedExit = true;
    });

    setHandler(agentWorkflowContinueAsNew, () => {
        userRequestedContinueAsNew = true;
    });

    setHandler(agentWorkflowClearContext, () => {
        context = [];
    });

    setHandler(agentWorkflowQueryContext, () => {
        return context;
    });

    const continueCondition = async () => {
        return condition(() => pending.length > 0 || userRequestedExit || userRequestedContinueAsNew);
    };

    const compactAndContinueAsNew = async () => {
        const compactContext = await compact({ context });
        return continueAsNew<typeof agentWorkflow>({
            continueAsNew: {
                context: compactContext.context,
                pending,
                activeAuthor,
                userRequestedExit
            },
        });
    };

    // Wait for the first message to arrive
    await continueCondition();

    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (userRequestedExit) {
            return;
        }

        if (userRequestedContinueAsNew) {
            return compactAndContinueAsNew();
        }

        // grab all the pending messages and put them into context
        while (pending.length > 0) {
            const entry = pending.shift()!;

            await persistUserMessage({
                workflowId: workflowInfo().workflowId,
                name: entry.author,
                type: "user-message",
                message: entry.message,
            });

            context.push(`<user_message date="${entry.date}" author="${entry.author}">\n${entry.message}\n</user_message>`);
        }

        const agentThought = await thought({ context });

        context.push(`<thought>\n${agentThought.thought}\n</thought>`);

        if (agentThought.__type === "answer") {
            await persistAgentMessage({
                workflowId: workflowInfo().workflowId,
                name: "assistant",
                type: "agent-message",
                message: agentThought.answer!,
            });

            context.push(`<answer>\n${agentThought.answer}\n</answer>`);

            const tokenCount = await tokens(context);
            const passedTokenLimit = tokenCount.tokenCount > tokenCount.tokenLimit;

            if (workflowInfo().continueAsNewSuggested || passedTokenLimit) {
                return compactAndContinueAsNew();
            }

            // wait for new messages or exit signal
            await continueCondition();
        }

        if (agentThought.__type === "action") {
            context.push(
                `<action><reason>\n${agentThought.action!.reason}\n</reason><name>${agentThought.action!.name}</name><input>${JSON.stringify(agentThought.action!.input)}</input></action>`,
            );

            const actionResult = await action(
                agentThought.action!.name,
                agentThought.action!.input,
            );

            const agentObservation = await observation(
                { context, actionResult },
            );

            context.push(
                `<observation>\n${agentObservation.observations}\n</observation>`,
            );
        }
    }
}
