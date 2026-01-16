import {
    condition,
    continueAsNew,
    defineQuery,
    defineSignal,
    proxyActivities,
    setHandler,
    workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import { HennosWorkflowUser } from "../common/types";

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

const { action, broadcast, tokens } = proxyActivities<typeof activities>({
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

const { compact, observation, restore } = proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

type PendingMessage = {
    message: string;
    date: string;
}

export type AgentWorkflowInput = {
    user: HennosWorkflowUser;
    aggressiveContinueAsNew: boolean;
    continueAsNew?: {
        context: string[];
        pending: PendingMessage[];
        userRequestedExit: boolean;
    };
};

export const agentWorkflowQueryContext = defineQuery<string[]>("agentWorkflowQueryContext");

export const agentWorkflowMessageSignal = defineSignal<[string, string]>(
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

    setHandler(agentWorkflowMessageSignal, (message: string, date: string) => {
        pending.push({
            message,
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

    // Only the very first time, see if we can import history from the database
    if (!input.continueAsNew) {
        try {
            const restoredMessages = await restore(input.user);
            for (const msg of restoredMessages) {
                context.push(msg);
            }
        } catch {
            // ignore errors during restore
        }
    }

    // Wait for the first message to arrive
    await condition(() => pending.length > 0 || userRequestedExit || userRequestedContinueAsNew);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (userRequestedExit) {
            return;
        }

        if (userRequestedContinueAsNew) {
            const compactContext = await compact(input.user, context);
            return continueAsNew<typeof agentWorkflow>({
                user: input.user,
                aggressiveContinueAsNew: input.aggressiveContinueAsNew,
                continueAsNew: {
                    context: compactContext.context,
                    pending,
                    userRequestedExit
                },
            });
        }

        // grab all the pending messages and put them into context
        while (pending.length > 0) {
            const entry = pending.shift()!;

            await broadcast({
                workflowId: workflowInfo().workflowId,
                user: input.user,
                type: "user-message",
                message: entry.message,
            });

            context.push(`<user_message date="${entry.date}">\n${entry.message}\n</user_message>`);
        }

        const agentThought = await thought(input.user, context);

        context.push(`<thought>\n${agentThought.thought}\n</thought>`);

        if (agentThought.__type === "answer") {
            await broadcast({
                workflowId: workflowInfo().workflowId,
                user: input.user,
                type: "agent-message",
                message: agentThought.answer,
            });

            context.push(`<answer>\n${agentThought.answer}\n</answer>`);

            const tokenCount = await tokens(input.user, context);
            const passedTokenLimit = tokenCount.tokenCount > tokenCount.tokenLimit;

            if (workflowInfo().continueAsNewSuggested || passedTokenLimit || input.aggressiveContinueAsNew) {
                const compactContext = await compact(input.user, context);
                return continueAsNew<typeof agentWorkflow>({
                    user: input.user,
                    aggressiveContinueAsNew: input.aggressiveContinueAsNew,
                    continueAsNew: {
                        context: compactContext.context,
                        pending,
                        userRequestedExit
                    },
                });
            }

            // wait for new messages or exit signal
            await condition(() => pending.length > 0 || userRequestedExit || userRequestedContinueAsNew);
        }

        if (agentThought.__type === "action") {
            context.push(
                `<action><reason>\n${agentThought.action.reason}\n</reason><name>${agentThought.action.name}</name><input>${JSON.stringify(agentThought.action.input)}</input></action>`,
            );

            const agentAction = await action(
                input.user,
                agentThought.action.name,
                agentThought.action.input,
            );

            const agentObservation = await observation(
                input.user,
                context,
                agentAction,
            );

            context.push(
                `<observation>\n${agentObservation.observations}\n</observation>`,
            );
        }
    }
}
