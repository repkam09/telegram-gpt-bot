import { ApplicationFailure, Context } from "@temporalio/activity";
import { CompletionContextEntry, resolveModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { LegacyAgenticResponse } from "../types";
import { tools } from "../tools";

export type LegacyCompletionInput = {
    context: CompletionContextEntry[];
    iterations: number;
}

export async function legacyCompletion(input: LegacyCompletionInput,
): Promise<LegacyAgenticResponse> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    const systemPrompt = legacyThoughtPromptTemplate({
        currentDate: new Date().toISOString().split("T")[0]
    });

    const model = resolveModelProvider("high");

    const response = await model.completion(workflowId, [
        { role: "system", content: systemPrompt },
        ...input.context,
    ], input.iterations, tools.map((tool) => tool.definition()));

    if (response.__type === "string") {
        Logger.debug(workflowId, `Received string response from model provider: ${response.payload}`);
        return {
            __type: "string",
            payload: response.payload,
        };
    }

    if (response.__type == "tool") {
        Logger.debug(workflowId, `Received tool response from model provider: ${JSON.stringify(response.payload)}`);
        return {
            __type: "action",
            payload: {
                name: response.payload.name,
                id: response.payload.id,
                input: response.payload.input
            }
        };
    }

    throw new ApplicationFailure("Invalid response from model provider, expected string or tool response", "InvalidModelResponse");
}

type LegacyThoughtPromptInput = {
    currentDate: string,
}

export function legacyThoughtPromptTemplate({ currentDate }: LegacyThoughtPromptInput): string {
    const dayOfWeek = new Date(currentDate).getDay();
    const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    return `You are a conversational assistant named Hennos that assists users. The current date is ${currentDate}. It is a ${dayOfWeekString} today.
`;
}

