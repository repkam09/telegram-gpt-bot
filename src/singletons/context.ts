import { encoding_for_model } from "tiktoken";
import { HennosUser } from "./user";
import { Config } from "./config";
import OpenAI from "openai";
import { HennosGroup } from "./group";

export async function getSizedChatContext(req: HennosUser | HennosGroup, prompt: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    const promptTokens = getChatContextTokenCount(prompt);

    const currentChatContext = await req.getChatContext();

    let totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    while (totalTokens > Config.HENNOS_MAX_TOKENS) {
        if (currentChatContext.length === 0) {
            throw new Error("Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
        }

        currentChatContext.shift();
        totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    }

    return prompt.concat(currentChatContext);
}


function getChatContextTokenCount(context: OpenAI.Chat.ChatCompletionMessageParam[]): number {
    const encoder = encoding_for_model("gpt-4");
    const total = context.reduce((acc, val) => {
        if (!val.content || typeof val.content !== "string") {
            return acc;
        }

        const tokens = encoder.encode(val.content).length;
        return acc + tokens;
    }, 0);

    encoder.free();
    return total;
}
