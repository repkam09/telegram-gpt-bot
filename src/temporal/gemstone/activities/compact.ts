import { resolveModelProvider } from "../../../provider";
import { Context } from "@temporalio/activity";
import { GemstoneAgentContext } from "../interface";

export type GemstoneCompactionInput = {
    context: GemstoneAgentContext[],
}

export type GemstoneCompactionResult = {
    context: GemstoneAgentContext[],
}

export async function gemstoneCompact(input: GemstoneCompactionInput
): Promise<GemstoneCompactionResult> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const model = resolveModelProvider("low");
    const compactTemplate = gemstoneCompactPromptTemplate({
        contextHistory: input.context.map(entry => `${entry.role}: ${entry.content}`).join("\n"),
    });

    const response = await model.invoke(workflowId, [
        { role: "user", content: compactTemplate, type: "text" },
    ]);

    if (response.__type !== "string") {
        throw new Error("Unexpected response type from model during compaction: " + response.__type);
    }

    return {
        context: [
            { role: "user", content: "Summarize our conversation so far." },
            { role: "assistant", content: response.payload }
        ],
    };
}

type GemstoneCompactPromptInput = {
    contextHistory: string,
}

export function gemstoneCompactPromptTemplate({ contextHistory }: GemstoneCompactPromptInput): string {
    return `You are a summarization agent tasked with compressing the chat history and context of a ReAct (Reasoning and Acting) agent.
  
Your goal is to summarize the provided context, attempting to preserve the most important parts of the context history.

Instructions:
1. Review the provided context history.
2. Summarize the context, focusing on preserving key information and recent steps.
3. Ensure that the most recent parts of the context remain intact.

Here is the context history to be compacted:

<conversation-context>
${contextHistory}
</conversation-context>

Provide a compressed version of the conversation-context, preserving important details and recent steps.
Only provide the compressed context in plain text format.
`;
}