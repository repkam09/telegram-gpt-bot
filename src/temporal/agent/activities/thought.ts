import { ApplicationFailure, Context } from "@temporalio/activity";
import { availableToolsAsString } from "../../../tools/tools";
import { HennosTool, resolveModelProvider } from "../../../provider";
import { HennosAgenticResponse } from "../../../types";
import { Logger } from "../../../singletons/logger";

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
        Logger.debug(workflowId, `Received string response from model provider: ${response.payload}`);
        return {
            __type: "string",
            payload: response.payload,
        };
    }

    if (response.__type == "tool") {
        Logger.debug(workflowId, `Received tool response from model provider: ${JSON.stringify(response.payload)}`);

        if (response.payload.name === "nothing") {
            Logger.debug(workflowId, "Model provider indicated to do nothing, returning empty response.");
            return {
                __type: "empty",
            };
        }

        if (response.payload.name === "perform_action") {
            Logger.debug(workflowId, "Model provider indicated to perform an action, returning action response.");
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
    
You have two options available to you: 
 - "perform_action": Indicates that you have decided to take a specific action using a tool, providing the necessary input and reasoning for this decision.
 - Provide a string response directly back to the user.

You should use the 'nothing' tool if there is nothing you need to do or say back to the user. For example, if you have already assisted the user and they simply thank you, you can respond with the 'nothing' tool
because the user is not asking for anything further and you have nothing more to add. This allows you to gracefully end the conversation without needing to generate another response.

The 'perform_action' tool should be used when you have decided to take a specific action to gather more information or to perform a task that will help you answer the user's query.
When using the 'perform_action' tool, you should specify the name of the tool you want to use and provide the necessary input for that tool in JSON format.
The available actions are described below in the 'available-actions' section.

If you have come to a final answer, or need to ask the user for more information, you can simply output a string response, this will be sent back to the user and added to your context.
Doing this will end the current thinking step and return control back to the user.

Remember:
- Use tools when you need more information.
- Use tools to validate your assumptions and internal knowledge.
- Be sure to match the action input and tool schema exactly.
- If a tool returns no results or fails, consider using a different tool or approach.
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

Here are the possible tools available to you for this task:
<available-actions>
${availableActions}
</available-actions>
`;
}

