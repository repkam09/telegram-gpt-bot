import { HennosUserFromWorkflowUser } from "../../../../singletons/consumer";
import { HennosOpenAISingleton } from "../../../../singletons/llms/openai";
import { HennosWorkflowUser } from "../../common/types";

type CompactionResult = {
    context: string[];
};

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
    ], [undefined, undefined, undefined]);

    if (response.__type !== "message") {
        throw new Error("Invalid response type from compact activity");
    }

    // Return the latest 3 context entries along with the new compacted context
    return {
        context: [response.payload, ...context.slice(-3)],
    };
}



type CompactPromptInput = {
    userDetails: HennosWorkflowUser,
    contextHistory: string,
}

export function compactPromptTemplate({ contextHistory, userDetails }: CompactPromptInput): string {
    return `You are a summarization agent tasked with compressing the chat history and context of a ReAct (Reasoning and Acting) agent.
  
Your goal is to summarize the provided context, attempting to preserve the most important parts of the context history.

Instructions:
1. Review the provided context history.
2. Summarize the context, focusing on preserving key information and recent steps.
3. Ensure that the most recent parts of the context remain intact.

You do not need to include any XML tags such as <thought>, <action>, or <observation> in your response, those will be added automatically by the Agent Workflow.

You are assisting a user in an ongoing chat session. Here is the user's information:

<user-info>
${userDetails.displayName}
</user-info>

Here is the context history to be compacted:

<context-history>
${contextHistory}
</context-history>

Provide a compressed version of the context history, preserving important details and recent steps.
`;
}