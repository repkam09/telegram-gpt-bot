import { encoding_for_model } from "tiktoken";
import { HennosUser } from "./user";
import { HennosGroup } from "./group";
import { Message } from "ollama";
import { Logger } from "./logger";

export async function getSizedChatContext(req: HennosUser | HennosGroup, prompt: Message[], currentChatContext: Message[], limit: number): Promise<Message[]> {
    const promptTokens = getChatContextTokenCount(prompt);
    let totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    while (totalTokens > limit) {
        if (currentChatContext.length === 0) {
            Logger.warn(req, "Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
            throw new Error("Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
        }

        currentChatContext.shift();
        totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    }

    Logger.info(req, `getSizedChatContext set total tokens to ${totalTokens}`);
    Logger.debug(`getSizedChatContext User: ${req.displayName}, System: ${JSON.stringify(prompt)}, Context: ${JSON.stringify(currentChatContext)}`);
    return currentChatContext;
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
