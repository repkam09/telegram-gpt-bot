import { ApplicationFailure, log, Context } from "@temporalio/activity";
import { availableToolsAsString } from "../../../tools/tools";
import { HennosTool, resolveModelProvider } from "../../../provider";
import { HennosAgenticResponse } from "../../../types";

export type ThoughtInput = {
    context: string[];
}

export async function thought(input: ThoughtInput,
): Promise<HennosAgenticResponse> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    const promptTemplate = thoughtPromptTemplate({
        currentDate: new Date().toISOString().split("T")[0],
        previousSteps: input.context.join("\n"),
        availableActions: availableToolsAsString(workflowId),
    });

    const model = resolveModelProvider("high");

    const tools: HennosTool[] = [
        {
            type: "function",
            function: {
                name: "nothing",
                description: "Indicates that the agent has decided to not take any action at this time. This tool will end the current thinking step and return control back to the user, allowing the agent to wait for more information or a new query before responding again.",
                type: "object",
                parameters: {
                    type: "object",
                    properties: {
                        reason: {
                            type: "string",
                            description: "A few words describing the reason why the agent has decided to not take any action at this time. This will only be used for logging and debugging purposes.",
                        }
                    }
                }
            }
        },
        {
            type: "function",
            function: {
                name: "internal_thought",
                description: "Allows the agent to record an internal thought or reasoning step without taking an external action. This can be used to keep track of the agent's thought process and reasoning as it works towards a final answer.",
                type: "object",
                parameters: {
                    type: "object",
                    properties: {
                        thought: {
                            type: "string",
                            description: "The content of the internal thought or reasoning step that the agent wants to record. Keep this concise but informative using a single sentence or short paragraph to capture the essence of the thought or reasoning step.",
                        }
                    },
                    required: ["thought"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "perform_action",
                description: "Indicates that the agent has decided to take a specific action using a tool, providing the necessary input and reasoning for this decision.",
                type: "object",
                parameters: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "The name of the tool to be used."
                        },
                        input: {
                            type: "string",
                            description: "A JSON String representing the input to be provided to the tool, which should match the tool's input schema exactly.",
                        }
                    },
                    required: ["name", "input"]
                }
            }
        }
    ];

    const response = await model.invoke(workflowId, [
        { role: "user", content: promptTemplate, type: "text" },
    ], tools);

    if (response.__type === "string") {
        log.debug(`Received string response from model provider: ${response.payload}`);
        return {
            __type: "string",
            payload: response.payload,
        };
    }

    if (response.__type == "tool") {
        log.debug(`Received tool response from model provider: ${JSON.stringify(response.payload)}`);

        if (response.payload.name === "nothing") {
            log.debug("Model provider indicated to do nothing, returning empty response.");
            return {
                __type: "empty",
            };
        }

        if (response.payload.name === "internal_thought") {
            log.debug("Model provider provided an internal thought, returning internal thought response.");
            const thought = JSON.parse(response.payload.input) as { thought: string };
            return {
                __type: "internal_thought",
                payload: thought.thought,
            };
        }

        if (response.payload.name === "perform_action") {
            log.debug("Model provider indicated to perform an action, returning action response.");
            const action = JSON.parse(response.payload.input) as { name: string, input: string };
            const input = JSON.parse(action.input);
            return {
                __type: "action",
                payload: {
                    name: action.name,
                    input: input
                }
            };
        }

        throw new ApplicationFailure(`Invalid tool response from model provider, unrecognized tool name: ${response.payload.name}`, "InvalidModelResponse");
    }

    throw new ApplicationFailure("Invalid response from model provider, expected string or tool response", "InvalidModelResponse");
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

You have four top level options available to you:

 - "nothing": Indicates that you have decided to not take any action at this time, and will wait for more information or a new query before responding again.
 - "internal_thought": Allows you to record an internal thought or reasoning step without taking an external action. This can be used to keep track of your thought process and reasoning as you work towards a final answer.
 - "perform_action": Indicates that you have decided to take a specific action using a tool, providing the necessary input and reasoning for this decision.
 - Provide a string response directly back to the user.

You should use the 'nothing' tool if there is nothing you need to do or say back to the user. For example, if you have already assited the user and they simply thank you, you can respond with the 'nothing' tool
because the user is not asking for anything further and you have nothing more to add. This allows you to gracefully end the conversation without needing to generate a final answer or response.

You should use the 'internal_thought' tool to record any internal thoughts or reasoning steps that you want to keep track of as you work towards a final answer.
This can be helpful for keeping a clear record of your thought process and reasoning, especially if the context is complex or requires multiple steps of reasoning.
The 'internal_thought' can be used to capture a plan for how you will tackle a problem, a hypothesis about what might be going on, a reflection on what information you have or still need, or 
any other relevant thought or reasoning step that you want to remember as you work towards a final answer.

The 'perform_action' tool should be used when you have decided to take a specific action to gather more information or to perform a task that will help you answer the user's query.
When using the 'perform_action' tool, you should specify the name of the tool you want to use and provide the necessary input for that tool in JSON format.
The available actions are described below in the 'available-actions' section.

If you have come to a final answer, or need to ask the user for more information, you can simply output a string response without using any tools or actions.
This will be sent back to the user and added to your context. This will end the current thinking step and return control back to the user.

Remember:
- Be thorough in your reasoning.
- Use tools when you need more information.
- Use tools to validate your assumptions and internal knowledge.
- Be sure to match the action input schema exactly.
- Always base your reasoning on the actual observations from tool use.
- If a tool returns no results or fails, acknowledge this and consider using a different tool or approach.
- Provide a final answer only when you're confident you have sufficient information.
- If you cannot find the necessary information after using available tools, admit that you don't have enough information to answer the query confidently.
- Your internal knowledge may be outdated. The current date is ${currentDate}. It is a ${dayOfWeekString} today.


You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response, those will be added automatically by the Agent Workflow.
You should respond in concise paragraphs, separated by two newlines, to maintain readability and clarity. You should use minimal Markdown formatting only for things like lists and code blocks.

You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at 'https://github.com/repkam09/telegram-gpt-bot'.

You may see some external_context or external_artifact entries in the context. external_context entries will provide messages or information outside of normal user messages, maybe forwarded from another user or source.
external_artifact entries will provide references to files or other artifacts relevant to the context, you can use actions to retrieve and analyze those artifacts if needed.

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

