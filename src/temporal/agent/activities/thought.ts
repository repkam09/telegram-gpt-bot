import { ApplicationFailure, log } from "@temporalio/activity";
import { HennosOpenAISingleton } from "../../../singletons/openai";
import { availableToolsAsString } from "../../../tools/tools";
import { workflowInfo } from "@temporalio/workflow";

export type ThoughtInput = {
    context: string[];
}

export type ThoughtResult = {
    __type: "action" | "answer";
    thought: string;
    action?: {
        name: string;
        reason: string;
        input: string | object;
    };
    answer?: string;
}

export async function thought(input: ThoughtInput,
): Promise<ThoughtResult> {
    const workflowId = workflowInfo().workflowId;

    const promptTemplate = thoughtPromptTemplate({
        currentDate: new Date().toISOString().split("T")[0],
        previousSteps: input.context.join("\n"),
        availableActions: availableToolsAsString(workflowId),
    });

    const model = HennosOpenAISingleton.instance();

    const response = await model.invoke(workflowId, [
        { role: "user", content: promptTemplate, type: "text" },
    ], true);

    try {
        JSON.parse(response.payload);
    } catch (e) {
        log.error(`Failed to parse agent result JSON: ${(e as Error).message}\nResponse payload: ${response.payload}`);
        throw ApplicationFailure.retryable(`Failed to parse agent result JSON: ${(e as Error).message}`);
    }

    const parsed = JSON.parse(response.payload);

    if (Object.prototype.hasOwnProperty.call(parsed, "answer")) {
        parsed.__type = "answer";
    }

    if (Object.prototype.hasOwnProperty.call(parsed, "action")) {
        parsed.__type = "action";
    }

    if (!Object.prototype.hasOwnProperty.call(parsed, "__type")) {
        throw ApplicationFailure.retryable("Parsed agent result does not have a valid __type");
    }

    return parsed as ThoughtResult;
}

type ThoughtPromptInput = {
    currentDate: string,
    previousSteps: string,
    availableActions: string,
}

export function thoughtPromptTemplate({ availableActions, currentDate, previousSteps }: ThoughtPromptInput): string {
    const dayOfWeek = new Date().getDay();
    const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

    return `You are a ReAct (Reasoning and Acting) agent named Hennos tasked with assisting a user.
Your goal is to reason about the context and decide on the best course of action to answer it accurately.

Instructions:
1. Analyze the context, previous reasoning steps, and observations.
2. Decide on the next action: use a tool or provide a final answer.
3. Respond in one of the the following JSON formats:

If you need to use a tool:
{{
    "thought": "Your detailed reasoning about what to do next",
    "action": {{
        "name": "Tool name",
        "reason": "Explanation of why you chose this tool",
        "input": "JSON object matching to tool input schema"
    }}
}}

If you have enough information to answer the query:
{{
    "thought": "Your final reasoning process",
    "answer": "Your comprehensive answer to the query"
}}

Remember:
- Be thorough in your reasoning.
- Use tools when you need more information.
- Use tools to validate your assumptions and internal knowledge.
- Be sure to match the tool input schema exactly.
- Always base your reasoning on the actual observations from tool use.
- If a tool returns no results or fails, acknowledge this and consider using a different tool or approach.
- Provide a final answer only when you're confident you have sufficient information.
- If you cannot find the necessary information after using available tools, admit that you don't have enough information to answer the query confidently.
- Your internal knowledge may be outdated. The current date is ${currentDate}. It is a ${dayOfWeekString} today.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response, those will be added automatically by the Agent Workflow.
You should respond in concise paragraphs, separated by two newlines, to maintain readability and clarity. You should use minimal Markdown formatting only for things like lists and code blocks.

You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at 'https://github.com/repkam09/telegram-gpt-bot'.

You may see some external_context or external_artifact entries in the context. external_context entries will provide messages or information outside of normal user messages, maybe forwarded from another user or source.
external_artifact entries will provide references to files or other artifacts relevant to the context, you can use tool calls to retrieve and analyze those artifacts if needed.

In this thinking step, consider the following information from previous steps:

<previous-steps>
${previousSteps}
</previous-steps>

Based on that information, provide your thought process and decide on the next action.
<available-actions>
${availableActions}
</available-actions>
`;
}

