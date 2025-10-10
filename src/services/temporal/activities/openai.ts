import OpenAI from "openai";
import { Config } from "../../../singletons/config";
import { ApplicationFailure } from "@temporalio/workflow";
import { Logger } from "../../../singletons/logger";
import { HennosWorkflowUser } from "../types";

export async function chat(user: HennosWorkflowUser, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<OpenAI.Chat.Completions.ChatCompletion.Choice> {
    const client = new OpenAI({
        apiKey: Config.OPENAI_API_KEY,
    });

    const model = user.isWhitelisted ? Config.OPENAI_LLM.MODEL : Config.OPENAI_MINI_LLM.MODEL;

    const [tool_choice, tools, parallel_tool_calls] = getAvailableTools(user);
    const response = await client.chat.completions.create({
        model,
        messages,
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

    return response.choices[0];
}

function getAvailableTools(user: HennosWorkflowUser): [
    OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined,
    OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    boolean | undefined
] {
    Logger.info(`Fetching available tools for chatId ${user.userId.value}`);
    return [undefined, undefined, undefined];
}