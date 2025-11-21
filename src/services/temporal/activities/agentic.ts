import { HennosUserFromWorkflowUser } from "../../../singletons/consumer";
import { Database } from "../../../singletons/data/sqlite";
import { HennosOpenAISingleton } from "../../../singletons/llms/openai";
import { ToolCallResponse } from "../../../tools/BaseTool";
import { availableToolsAsString, processToolCalls } from "../../../tools/tools";
import { HennosStringResponse } from "../../../types";
import { InternalCallbackHandler } from "../../events/internal";
import { LifeforceBroadcast } from "../../events/lifeforce";
import { compactPromptTemplate, observationPromptTemplate, thoughtPromptTemplate } from "../common/prompts";
import { HennosWorkflowUser, UsageMetadata } from "../common/types";

type AgentResult = AgentResultTool | AgentResultFinal;
type AgentResultTool = {
    __type: "action";
    thought: string;
    action: {
        name: string;
        reason: string;
        input: string | object;
    };
};

type AgentResultFinal = {
    __type: "answer";
    thought: string;
    answer: string;
};

type ObservationResult = {
    observations: string;
};

type CompactionResult = {
    context: string[];
};

export async function thought(
    userDetails: HennosWorkflowUser,
    context: string[],
): Promise<AgentResult> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const model = req.getProvider();

    const promptTemplate = thoughtPromptTemplate({
        userDetails: userDetails,
        currentDate: new Date().toISOString().split("T")[0],
        previousSteps: context.join("\n"),
        availableActions: availableToolsAsString(req),
    });

    const response = await model.invoke(req, [
        { role: "user", content: promptTemplate, type: "text" },
    ]) as HennosStringResponse;

    const parsed = JSON.parse(response.payload);

    if (Object.prototype.hasOwnProperty.call(parsed, "answer")) {
        parsed.__type = "answer";
    }

    if (Object.prototype.hasOwnProperty.call(parsed, "action")) {
        parsed.__type = "action";
    }

    if (!Object.prototype.hasOwnProperty.call(parsed, "__type")) {
        throw new Error("Parsed agent result does not have a valid __type");
    }

    return parsed as AgentResult;
}

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

export async function observation(
    userDetails: HennosWorkflowUser,
    context: string[],
    actionResult: string,
): Promise<ObservationResult> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const model = HennosOpenAISingleton.mini();

    const promptTemplate = observationPromptTemplate({
        userDetails: userDetails,
        previousSteps: context.join("\n"),
        actionResult: actionResult,
    });

    const response = await model.invoke(req, [
        { role: "user", content: promptTemplate, type: "text" },
    ]);
    return {
        observations: response.payload,
    };
}

export async function compact(
    userDetails: HennosWorkflowUser,
    context: string[],
): Promise<CompactionResult> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const model = HennosOpenAISingleton.mini();

    const compactTemplate = compactPromptTemplate({
        userDetails: userDetails,
        contextHistory: context.join("\n"),
    });

    const response = await model.invoke(req, [
        { role: "user", content: compactTemplate, type: "text" },
    ]);

    // Return the latest 3 context entries along with the new compacted context
    return {
        context: [response.payload, ...context.slice(-3)],
    };
}

export type BroadcastInput = BroadcastUsageInput | BroadcastUserInput | BroadcastAgentInput;

type BroadcastUserInput = {
    type: "user-message"
    user: HennosWorkflowUser;
    workflowId: string;
    message: string;
}

type BroadcastAgentInput = {
    type: "agent-message"
    workflowId: string;
    user: HennosWorkflowUser;
    message: string;
}

type BroadcastUsageInput = {
    type: "usage"
    workflowId: string;
    usage: UsageMetadata;
}

export async function broadcast(input: BroadcastInput): Promise<void> {
    switch (input.type) {
        case "user-message":
            // Using the user info, update the database with the message for long term storage
            await Promise.all([
                updateWorkflowMessageDatabase(input),
            ]);
            break;
        case "agent-message":
            // Using the user info, update the database with the message for long term storage
            await Promise.all([
                updateWorkflowMessageDatabase(input),
                LifeforceBroadcast.broadcast(input),
                InternalCallbackHandler.broadcast(input.workflowId, "message", input.message),
            ]);
            break;
        case "usage":
            InternalCallbackHandler.broadcast(input.workflowId, "usage", JSON.stringify(input.usage));
            break;
        default:
            console.error("Unknown broadcast input type:", (input as BroadcastInput).type);
    }
}

async function updateWorkflowMessageDatabase(input: BroadcastUserInput | BroadcastAgentInput): Promise<void> {
    const db = Database.instance();
    await db.workflowMessage.create({
        data: {
            workflowId: input.workflowId,
            content: input.message,
            type: "text",
            userId: input.user.userId.value,
            role: input.type === "user-message" ? "user" : "assistant",
            datetime: new Date(),
        }
    });
}