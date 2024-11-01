import { encoding_for_model } from "tiktoken";
import { Message } from "ollama";
import { Logger } from "./logger";
import { HennosConsumer } from "./base";

export async function getSizedChatContext(req: HennosConsumer, prompt: Message[], currentChatContext: Message[], limit: number): Promise<Message[]> {
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
    return currentChatContext;
}

function getChatContextTokenCount(context: Message[]): number {
    const encoder = encoding_for_model("gpt-3.5-turbo");
    const total = context.reduce((acc, val) => {
        if (!val || !val.content || typeof val.content !== "string") {
            Logger.debug(undefined, `getChatContextTokenCount encountered an invalid message, skipping. ${val}`);
            return acc;
        }

        const tokens = encoder.encode(val.content).length;
        return acc + tokens;
    }, 0);

    encoder.free();
    return total;
}
