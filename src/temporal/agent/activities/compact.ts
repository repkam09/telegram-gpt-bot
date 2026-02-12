import { resolveModelProvider } from "../../../provider";
import { Context } from "@temporalio/activity";

export type CompactionInput = {
    context: string[],
}

export type CompactionResult = {
    context: string[],
}

export async function compact(input: CompactionInput
): Promise<CompactionResult> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const model = resolveModelProvider("low");
    const compactTemplate = compactPromptTemplate({
        contextHistory: input.context.join("\n"),
    });

    const response = await model.invoke(workflowId, [
        { role: "user", content: compactTemplate, type: "text" },
    ]);

    if (response.__type !== "string") {
        throw new Error("Unexpected response type from model during compaction: " + response.__type);
    }

    // Return the latest 3 context entries along with the new compacted context
    return {
        context: [response.payload, ...input.context.slice(-3)],
    };
}

type CompactPromptInput = {
    contextHistory: string,
}

export function compactPromptTemplate({ contextHistory }: CompactPromptInput): string {
    return `You are a summarization agent tasked with compressing the chat history and context of a ReAct (Reasoning and Acting) agent.
  
Your goal is to summarize the provided context, attempting to preserve the most important parts of the context history.

Instructions:
1. Review the provided context history.
2. Summarize the context, focusing on preserving key information and recent steps.
3. Ensure that the most recent parts of the context remain intact.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response. Just provide the compressed context in plain text format.

Here is the context history to be compacted:

<conversation-context>
${contextHistory}
</conversation-context>

Provide a compressed version of the conversation-context, preserving important details and recent steps.
`;
}