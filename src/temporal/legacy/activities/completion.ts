import fs from "fs/promises";
import { ApplicationFailure, Context } from "@temporalio/activity";
import { CompletionContextEncodedImage, CompletionContextEntry, CompletionContextImage, CompletionContextImageEntry, CompletionContextTextEntry, resolveModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { LegacyAgenticResponse } from "../types";
import { availableTools } from "../tools";
import { lastActiveDateString, temporalGrounding } from "../../../common/grounding";
import { parseWorkflowId } from "../interface";
import { Database } from "../../../database";
import { encoding_for_model } from "tiktoken";

export type LegacyCompletionInput = {
    context: CompletionContextEntry[];
    iterations: number;
}

export async function legacyCompletion(input: LegacyCompletionInput,
): Promise<LegacyAgenticResponse> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    const systemPrompt = legacyCompletionPromptTemplate({
        currentDate: new Date()
    });

    // Load this from the database
    const complete = await getChatContext(workflowId);
    const conversation = await getSizedChatContext(workflowId, [{ role: "system", content: systemPrompt }], complete, 16000);

    const tools = availableTools(workflowId);

    const model = resolveModelProvider("high");
    const response = await model.completion(workflowId, [
        { role: "system", content: systemPrompt },
        ...conversation,
        ...input.context,
    ], input.iterations, tools ? tools.map((tool) => tool.definition()) : []);

    if (response.__type === "string") {
        Logger.debug(workflowId, `Received string response from model provider: ${response.payload}`);
        return {
            __type: "string",
            payload: response.payload,
        };
    }

    if (response.__type == "tool") {
        Logger.debug(workflowId, `Received tool response from model provider: ${JSON.stringify(response.payload)}`);
        return {
            __type: "action",
            payload: {
                name: response.payload.name,
                id: response.payload.id,
                input: response.payload.input
            }
        };
    }

    throw new ApplicationFailure("Invalid response from model provider, expected string or tool response", "InvalidModelResponse");
}

type LegacyCompletionPromptInput = {
    currentDate: Date,
    lastActiveDate?: Date,
}

export function legacyCompletionPromptTemplate({ currentDate, lastActiveDate }: LegacyCompletionPromptInput): string {
    const { date, day } = temporalGrounding(currentDate);
    const activity = lastActiveDate ? lastActiveDateString(lastActiveDate) : "";

    return `You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly.
Your job is to assist users in a variety of tasks, including answering questions, providing information, and engaging in conversation.
You should respond in concise paragraphs, separated by two newlines, to maintain readability and clarity. You should use minimal Markdown formatting only for things like lists and code blocks.
You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at 'https://github.com/repkam09/telegram-gpt-bot'.
You are powered by Large Language Models from OpenAI, Anthropic, or Ollama, but which specific model or provider is used for a given request is configured by the user by using the '/settings' command.
Your knowledge is based on the data your model was trained on. Be aware that you may not have the most up to date information in your training data. The current date is ${date}. It is a ${day} today.

In order to provide the best possible assistance you should make use of various tool calls to gather additional information, to verify information you have in your training data, and to make sure you provide the most accurate and up-to-date information.
${activity}
`;
}

async function getChatContext(workflowId: string, limit: number = 100): Promise<CompletionContextEntry[]> {
    const flow = parseWorkflowId(workflowId);

    const db = Database.instance();
    const entries = await db.messages.findMany({
        where: {
            chatId: Number(flow.chatId),
        },
        select: {
            id: true,
            role: true,
            content: true,
            type: true
        },
        orderBy: {
            id: "desc"
        },
        take: limit
    });

    Logger.debug(workflowId, `Retrieved ${entries.length} messages from the database for chatId: ${flow.chatId}`);

    const messages: CompletionContextEntry[] = [];
    for (const entry of entries) {
        if (entry.type === "text") {
            messages.push({
                role: entry.role as "user" | "assistant" | "system",
                content: entry.content
            });
        } else if (entry.type === "image") {
            const image = JSON.parse(entry.content) as CompletionContextImage;
            const encoded = await loadCompletionContextImage(image);
            if (encoded) {
                Logger.debug(workflowId, `Loaded image from disk: ${image.local}`);
                messages.push({
                    role: entry.role as "user" | "assistant" | "system",
                    image,
                    encoded
                });
            } else {
                Logger.warn(workflowId, `Failed to load image from disk: ${image.local}`);
            }

        } else {
            Logger.warn(workflowId, `Unknown message type in conversation context, chatId: ${flow.chatId}, messageId: ${entry.id}, type: ${entry.type}`);
        }
    }

    Logger.debug(workflowId, `Total messages processed for chatId ${flow.chatId}: ${messages.length}`);

    return messages.reverse();
}

async function getSizedChatContext(workflowId: string, system: CompletionContextEntry[], prompt: CompletionContextEntry[], limit: number): Promise<CompletionContextEntry[]> {
    const systemPromptTokens = getChatContextTokenCount(system);
    let totalTokens = getChatContextTokenCount(prompt) + systemPromptTokens;
    while (totalTokens > limit) {
        if (prompt.length === 0) {
            Logger.warn(workflowId, "Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
            throw new Error("Chat context cleanup failed, unable to remove enough tokens to create a valid request.");
        }

        prompt.shift();
        totalTokens = getChatContextTokenCount(prompt) + systemPromptTokens;
    }

    Logger.debug(workflowId, `getSizedChatContext set total tokens to ${totalTokens}`);
    return prompt;
}

function getChatContextTokenCount(context: CompletionContextEntry[]): number {
    const encoder = encoding_for_model("gpt-4o-mini");
    const total = context.reduce((acc: number, val: CompletionContextEntry) => {
        if (val.role === "user" || val.role === "assistant" || val.role === "system") {
            const textVal = val as CompletionContextTextEntry;
            if (textVal.content) {
                const tokens = encoder.encode(textVal.content).length;
                return acc + tokens;
            }

            const imageVal = val as CompletionContextImageEntry;
            if (imageVal.encoded) {
                const tokens = 1028; // Estimated token count for an image
                return acc + tokens;
            }
        }
        return acc;

    }, 0);

    encoder.free();
    return total;
}

export async function loadCompletionContextImage(image: CompletionContextImage): Promise<CompletionContextEncodedImage | null> {
    try {
        Logger.debug(undefined, `Loading image from ${image.local} Start`);
        const raw = await fs.readFile(image.local);
        const data = Buffer.from(raw).toString("base64");
        Logger.debug(undefined, `Loading image from ${image.local} Finish: ${data.length} bytes`);
        return { __type: "b64_image", data };
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(undefined, `Failed to load image from ${image.local}: ${error.message}`);
        return null;
    }

}