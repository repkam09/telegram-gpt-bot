import { encoding_for_model } from "tiktoken";
import { HennosUser } from "./user";
import { Config } from "./config";
import { HennosGroup } from "./group";
import { Message } from "ollama";

export async function getSizedChatContext(req: HennosUser | HennosGroup, prompt: Message[], currentChatContext: Message[]): Promise<Message[]> {
    const promptTokens = getChatContextTokenCount(prompt);
    
    let totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    while (totalTokens > Config.OLLAMA_LLM.CTX) {
        if (currentChatContext.length === 0) {
            throw new Error("Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
        }

        currentChatContext.shift();
        totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    }

    return prompt.concat(currentChatContext);
}


function getChatContextTokenCount(context: Message[]): number {
    const encoder = encoding_for_model("gpt-3.5-turbo");
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
