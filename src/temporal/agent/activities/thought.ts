import { ApplicationFailure, Context } from "@temporalio/activity";
import { HennosTool, resolveModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { HennosAgenticResponse } from "../types";
import { availableToolsAsString } from "../tools";
import { temporalGrounding } from "../../../common/grounding";
import { withActivityHeartbeat } from "../../heartbeat";
import { Config } from "../../../singletons/config";
import { MemoryDataStore } from "../../activities";
import { parseWorkflowId } from "../interface";
import { Memory, MemoryToXML } from "../../memory/types";

export type ThoughtInput = {
    context: string[];
    iterations: number;
}

export const thought = withActivityHeartbeat(_thought);
async function _thought(input: ThoughtInput,
): Promise<HennosAgenticResponse> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    const info = parseWorkflowId(workflowId);

    const memories = await MemoryDataStore.searchSemantic(info.chatId, input.context);

    const promptTemplate = thoughtPromptTemplate({
        currentDate: new Date(),
        previousSteps: input.context.join("\n"),
        availableActions: await availableToolsAsString(workflowId),
        memories
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
                        },
                        reason: {
                            type: "string",
                            description: "The agent's reasoning for why it chose to use this tool and how it will help answer the user's query. This should be a concise explanation of the agent's thought process leading to the decision to use this tool.",
                        }
                    },
                    required: ["name", "input", "reason"]
                }
            }
        }
    ];

    // Force the model to answer if we've reached the maximum tool depth to prevent infinite loops.
    const _tools = input.iterations < Config.HENNOS_TOOL_DEPTH ? tools : [];

    const response = await model.invoke(workflowId, [
        { role: "system", content: promptTemplate, type: "text" },
    ], _tools);

    if (response.__type === "string") {
        Logger.debug(workflowId, `Received string response from model provider: ${response.payload}`);
        return {
            __type: "string",
            payload: response.payload,
        };
    }

    if (response.__type == "tool") {
        Logger.debug(workflowId, `Received tool response from model provider: ${JSON.stringify(response.payload)}`);

        const payloads = response.payload.map((payload) => {
            if (payload.name === "perform_action") {
                try {
                    Logger.debug(workflowId, "Model provider indicated to perform an action, creating action response.");
                    const action = JSON.parse(payload.input) as { name: string, input: string; reason: string };
                    Logger.debug(workflowId, `Parsed action input: ${JSON.stringify(action)}`);
                    const input = JSON.parse(action.input);
                    Logger.debug(workflowId, `Parsed action input into JSON: ${JSON.stringify(input)}`);
                    return {
                        name: action.name,
                        reason: action.reason,
                        input: input
                    };
                } catch (error) {
                    Logger.error(workflowId, `Failed to parse action input from model provider: ${error}`);
                    throw error;
                }
            } else {
                try {
                    Logger.debug(workflowId, `Model provider indicated to perform an unknown tool: ${payload.name}, attempting to process.`);
                    const input = JSON.parse(payload.input) as Record<string, string>;
                    Logger.debug(workflowId, `Parsed unknown tool input into JSON: ${JSON.stringify(input)}`);
                    return {
                        name: payload.name,
                        reason: `${payload.name} with input ${payload.input}`,
                        input: input
                    };
                } catch (error) {
                    Logger.error(workflowId, `Failed to parse unknown tool input from model provider: ${error}`);
                    throw error;
                }
            }
        });

        return {
            __type: "action",
            payload: payloads
        };

    }

    throw new ApplicationFailure("Invalid response from model provider, expected string or tool response", "InvalidModelResponse");
}

type ThoughtPromptInput = {
    currentDate: Date,
    previousSteps: string,
    availableActions: string,
    memories: Memory[]
}

export function thoughtPromptTemplate({ availableActions, currentDate, previousSteps, memories }: ThoughtPromptInput): string {
    const { date, day } = temporalGrounding(currentDate);

    const formattedMemories = `Here are some long-term memories that have been extracted based on the current conversation:
<memories>
${memories.map(MemoryToXML).join("\n")}
</memories>
`.trim();

    return `You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly.
Your job is to assist users in a variety of tasks, including answering questions, providing information, and engaging in conversation.
You should respond in concise paragraphs, separated by two newlines, to maintain readability and clarity. You should use minimal Markdown formatting only for things like lists and code blocks.
You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at 'https://github.com/repkam09/telegram-gpt-bot'.
Your knowledge is based on the data your model was trained on. Be aware that you may not have the most up to date information in your training data. The current date is ${date}. It is a ${day} today.

In order to provide the best possible assistance you should make use of various tool calls to gather additional information, to verify information you have in your training data, and to make sure you provide the most accurate and up-to-date information.

${memories.length > 0 ? formattedMemories : ""}

Here is the context of the current conversation:
<conversation-context>
${previousSteps}
</conversation-context>

Here are the possible tools that can be used to gather additional information and provide better assistance:
<available-actions>
${availableActions}
</available-actions>
`;
}

