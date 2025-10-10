import OpenAI from "openai";
import { Config } from "../../../singletons/config";
import { ApplicationFailure } from "@temporalio/workflow";
import { Logger } from "../../../singletons/logger";
import { HennosWorkflowUser } from "../types";
import { minimalBasePrompt } from "../../../prompt";
import { ChatCompletionSystemMessageParam } from "openai/resources";

export async function chat(user: HennosWorkflowUser, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<OpenAI.Chat.Completions.ChatCompletion.Choice> {
    Logger.info(`Starting chat completion for user ${user.userId.value} with ${messages.length} messages`);
    const client = new OpenAI({
        apiKey: Config.OPENAI_API_KEY,
    });

    const model = user.isWhitelisted ? Config.OPENAI_LLM.MODEL : Config.OPENAI_MINI_LLM.MODEL;

    const prompt: ChatCompletionSystemMessageParam[] = minimalBasePrompt("Hennos").map((text) => ({ role: "system", content: text.content }));

    const [tool_choice, tools, parallel_tool_calls] = getAvailableTools();
    const response = await client.chat.completions.create({
        model,
        messages: [...prompt, ...messages],
        tool_choice,
        tools,
        parallel_tool_calls,
        safety_identifier: user.userId.value,
        n: 1
    });

    if (!response.choices && !response.choices[0]) {
        throw ApplicationFailure.retryable("Invalid OpenAI Response Shape", "InvalidOpenAIResponseShape");
    }

    if (!response.choices[0].message.tool_calls && !response.choices[0].message.content) {
        throw ApplicationFailure.retryable("Invalid OpenAI Response Shape, Missing Expected Message Properties", "InvalidOpenAIResponseShape");
    }

    Logger.info(`Completed chat completion for user ${user.userId.value} with model ${model}`);
    return response.choices[0];
}

function getAvailableTools(): [
    OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined,
    OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    boolean | undefined
] {
    return [undefined, undefined, undefined];
}