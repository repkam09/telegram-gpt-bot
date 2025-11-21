import {
    proxyActivities,
} from "@temporalio/workflow";
import type * as activities from "../activities";
import OpenAI from "openai";


const { fetchWorkflowMessages } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export async function messageHistory(userId: string): Promise<Message[]> {
    const messages = await fetchWorkflowMessages(userId);
    return messages.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
    }));
}