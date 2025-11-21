import { encoding_for_model } from "tiktoken";
import { Logger } from "../logger";
import { HennosConsumer } from "../consumer";
import { HennosMessage } from "../../types";

export async function getSizedChatContext(req: HennosConsumer, prompt: HennosMessage[], currentChatContext: HennosMessage[], limit: number): Promise<HennosMessage[]> {
    const promptTokens = getChatContextTokenCount(prompt);
    let totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    while (totalTokens > limit) {
        if (currentChatContext.length === 0) {
            Logger.warn(req, "Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
            throw new Error("Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
        }

        Logger.debug(req, `getSizedChatContext removing message from context, current total tokens: ${totalTokens}`);
        currentChatContext.shift();
        totalTokens = getChatContextTokenCount(currentChatContext) + promptTokens;
    }

    Logger.debug(req, `getSizedChatContext set total tokens to ${totalTokens}`);
    return currentChatContext;
}

export async function countTokens(req: HennosConsumer, messages: HennosMessage[]): Promise<number> {
    Logger.debug(req, `Counting tokens for ${messages.length} messages`);
    return getChatContextTokenCount(messages);
}

function getChatContextTokenCount(context: HennosMessage[]): number {
    const encoder = encoding_for_model("gpt-4o-mini");
    const total = context.reduce((acc: number, val: HennosMessage) => {
        if (val.type === "text") {
            const tokens = encoder.encode(val.content).length;
            return acc + tokens;
        }

        if (val.type === "image") {
            const tokens = 1028; // @TODO: This is a horrible hack
            return acc + tokens;
        }
        return acc;

    }, 0);

    encoder.free();
    return total;
}
