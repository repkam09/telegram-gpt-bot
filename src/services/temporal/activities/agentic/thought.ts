import { HennosUserFromWorkflowUser } from "../../../../singletons/consumer";
import { countTokens } from "../../../../singletons/data/context";
import { InvokeToolOptions } from "../../../../singletons/llms/base";
import { Logger } from "../../../../singletons/logger";
import { availableToolsAsString } from "../../../../tools/tools";
import type { HennosWorkflowUser } from "../../common/types";

export type ThoughtActivityResult = ThoughtActivityResultAction | ThoughtActivityResultFinal;

type ThoughtPromptInput = {
    userDetails: HennosWorkflowUser,
    currentDate: string,
    previousSteps: string,
    availableActions: string,
}

type ThoughtActivityResultAction = {
    __type: "action";
    thought: string;
    action: {
        reason: string
        name: string;
        input: Record<string, unknown>;
    }
}

type ThoughtActivityResultFinal = {
    __type: "answer";
    thought: string;
    answer: string;
}

export async function thought(
    userDetails: HennosWorkflowUser,
    context: string[],
): Promise<ThoughtActivityResult> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const model = req.getProvider();

    const promptTemplate = thoughtPromptTemplate({
        userDetails: userDetails,
        currentDate: new Date().toISOString().split("T")[0],
        previousSteps: context.join("\n"),
        availableActions: availableToolsAsString(req),
    });

    const thoughtTools = thoughtPromptTools();

    const response = await model.invoke(req, [
        { role: "user", content: promptTemplate, type: "text" },
    ], thoughtTools);

    if (response.__type === "message") {
        throw new Error("Invalid response type from thought activity");
    }

    try {
        JSON.parse(response.tool_input);
    } catch (e) {
        Logger.error("Failed to parse thought activity response", { response });
        throw e;
    }

    const parsed = JSON.parse(response.tool_input) as Record<string, unknown>;

    if (response.tool_name === "final_answer") {
        return {
            __type: "answer",
            thought: parsed.thought as string,
            answer: parsed.answer as string,
        };
    }

    if (response.tool_name === "action") {
        return {
            __type: "action",
            thought: parsed.thought as string,
            action: {
                reason: parsed.reason as string,
                name: parsed.action_name as string,
                input: parsed.action_input as Record<string, unknown>,
            },
        };
    }

    throw new Error("Unknown tool response from thought activity");
}

export function thoughtPromptTools(): InvokeToolOptions {
    return [
        "required",
        [
            {
                type: "function",
                function: {
                    name: "final_answer",
                    description: "Provide the final answer to the user's query based on the information gathered.",
                    parameters: {
                        type: "object",
                        properties: {
                            thought: {
                                type: "string",
                                description: "Your final thought process before providing the answer."
                            },
                            answer: {
                                type: "string",
                                description: "The final answer to the user's query. This will be communicated back to the user."
                            },
                        },
                        required: ["answer", "thought"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "action",
                    description: "Use this action to perform a tool call to gather more information.",
                    parameters: {
                        type: "object",
                        properties: {
                            thought: {
                                type: "string",
                                description: "Your thought process leading to the decision to use a tool."
                            },
                            action_name: {
                                type: "string",
                                description: "The name of the tool you wish to use."
                            },
                            action_input: {
                                type: "object",
                                description: "The input parameters required for the tool."
                            },
                        },
                        required: ["thought", "action_name", "action_input"]
                    }
                }
            }
        ],
        false
    ];
}

function thoughtPromptTemplate({ availableActions, userDetails, currentDate, previousSteps }: ThoughtPromptInput): string {
    return `You are a ReAct (Reasoning and Acting) agent named Hennos tasked with assisting a user. 
    
Here is the user's information:
<user-info>
${userDetails.displayName}
</user-info>

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
- Your internal knowledge may be outdated. The current date is ${currentDate}.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response, those will be added automatically by the Agent Workflow.

In this thinking step, consider the following information from previous steps:

<previous-steps>
${previousSteps}
</previous-steps>

Based on that information, provide your thought process and decide on the next action.
<available-actions>
${availableActions}
</available-actions>

Because you must respond in JSON format, your first token must be "{".
`;
}


export async function tokens(
    userDetails: HennosWorkflowUser,
    context: string[],
): Promise<{
    tokenCount: number;
    tokenLimit: number;
}> {
    const req = await HennosUserFromWorkflowUser(userDetails);
    const provider = req.getProvider();
    const promptTemplate = thoughtPromptTemplate({
        userDetails: userDetails,
        currentDate: new Date().toISOString().split("T")[0],
        previousSteps: context.join("\n"),
        availableActions: availableToolsAsString(req),
    });

    const result = await countTokens(req, [
        { role: "user", content: promptTemplate, type: "text" },
    ]);

    return {
        tokenCount: result,
        tokenLimit: provider.tokenLimit,
    };
}
