import { ApplicationFailure, Context } from "@temporalio/activity";
import { resolveModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { GemstoneAgenticResponse } from "../types";
import { tools } from "../tools";

export type ThoughtInput = {
    context: { role: "user" | "assistant" | "system"; content: string }[];
}

export async function thought(input: ThoughtInput,
): Promise<GemstoneAgenticResponse> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    const systemPrompt = thoughtPromptTemplate({
        currentDate: new Date().toISOString().split("T")[0]
    });

    const model = resolveModelProvider("low");

    const response = await model.invoke(workflowId, [
        { role: "system", content: systemPrompt, type: "text" },
        ...input.context.map((entry) => ({ role: entry.role, content: entry.content, type: "text" as const }))
    ], tools.map((tool) => tool.definition()));

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
                input: JSON.parse(response.payload.input)
            }
        };
    }

    throw new ApplicationFailure("Invalid response from model provider, expected string or tool response", "InvalidModelResponse");
}

type ThoughtPromptInput = {
    currentDate: string,
}

export function thoughtPromptTemplate({ currentDate }: ThoughtPromptInput): string {
    const dayOfWeek = new Date().getDay();
    const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    return `You are a conversational assistant named 'Gemcrab' that is an expert in answering questions about Oldschool RuneScape. Your job is to assist users by answering questions, providing information, and engaging in conversation around Oldschool RuneScape topics.
You should respond in concise paragraphs, separated by two newlines, to maintain readability and clarity. You should use minimal Markdown formatting only for things like lists and code blocks.
You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at 'https://github.com/repkam09/telegram-gpt-bot'.
Your knowledge is based on the data your model was trained on. Be aware that you may not have the most up to date information in your training data. You should always make use of tool calls to fetch the latest information.

The current date is ${currentDate}. It is a ${dayOfWeekString} today.
`;
}

