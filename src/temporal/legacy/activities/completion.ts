import fs from "fs/promises";
import { ApplicationFailure, Context } from "@temporalio/activity";
import { CompletionContextEncodedImage, CompletionContextEntry, CompletionContextImage, CompletionContextImageEntry, CompletionContextTextEntry, resolveLegacyModelProvider } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { LegacyAgenticResponse } from "../types";
import { availableTools } from "../tools";
import { lastActiveDateString, temporalGrounding } from "../../../common/grounding";
import { parseWorkflowId } from "../interface";
import { Database } from "../../../database";
import { encoding_for_model } from "tiktoken";
import { withActivityHeartbeat } from "../../heartbeat";
import { PromptComplexityResult } from "./classifier";
import { Config } from "../../../singletons/config";
import { MemoryFileStore } from "../../../tools/memory/MemoryFileStore";

export type LegacyCompletionInput = {
    context: CompletionContextEntry[];
    iterations: number;
    classification: PromptComplexityResult;
}

export const legacyCompletion = withActivityHeartbeat(_legacyCompletion);
async function _legacyCompletion(input: LegacyCompletionInput,
): Promise<LegacyAgenticResponse> {
    const workflowId = Context.current().info.workflowExecution.workflowId;
    const { classification } = input;

    Logger.debug(workflowId, `Completion using classification '${classification.complexity}': contextLimit=${classification.contextLimit}, useTools=${classification.useTools}, modelTier=${classification.modelTier}`);

    let memoryDirectory: string | undefined;
    if (Config.HENNOS_MEMORY_ENABLED) {
        try {
            const info = parseWorkflowId(workflowId);
            memoryDirectory = await new MemoryFileStore(info.chatId).directoryListing();
        } catch (error) {
            Logger.error(workflowId, `Failed to load memory directory listing: ${error}`);
        }
    }

    const systemPrompt = legacyCompletionPromptTemplate({
        currentDate: new Date(),
        memoryDirectory
    });

    const model = await resolveLegacyModelProvider(workflowId, classification.modelTier);

    // Load context from the database, sized according to complexity
    const complete = await getChatContext(workflowId, classification.contextLimit);
    const conversation = await getSizedChatContext(workflowId, [{ role: "system", content: systemPrompt }], complete, model.limit());

    const tools = classification.useTools ? availableTools(workflowId) : undefined;

    const prompt = [
        { role: "system" as const, content: systemPrompt },
        ...conversation,
        ...input.context,
    ];

    const systemTokenCount = getChatContextTokenCount([{ role: "system", content: systemPrompt }]);
    const conversationTokenCount = getChatContextTokenCount(conversation);
    const contextTokenCount = getChatContextTokenCount(complete);

    Logger.debug(workflowId, `Token counts - system: ${systemTokenCount}, conversation: ${conversationTokenCount}, context: ${contextTokenCount}, total: ${systemTokenCount + conversationTokenCount + contextTokenCount}, model limit: ${model.limit()}`);

    if ((systemTokenCount + conversationTokenCount + contextTokenCount) > model.limit()) {
        Logger.warn(workflowId, `Total token count for system (${systemTokenCount}), prompt (${conversationTokenCount}) and context (${contextTokenCount}) exceeds model limit (${model.limit()}).`);
    }

    const response = await model.completion(workflowId, prompt, input.iterations, tools ? tools.map((tool) => tool.definition()) : []);

    if (response.__type === "string") {
        Logger.debug(workflowId, "Received string response from model provider");
        return {
            __type: "string",
            payload: response.payload,
        };
    }

    if (response.__type == "tool") {
        Logger.debug(workflowId, `Received tool response from model provider: ${JSON.stringify(response.payload)}`);
        return {
            __type: "action",
            payload: response.payload.map((payload) => ({
                name: payload.name,
                id: payload.id,
                input: payload.input
            }))
        };
    }

    throw new ApplicationFailure("Invalid response from model provider, expected string or tool response", "InvalidModelResponse");
}

type LegacyCompletionPromptInput = {
    currentDate: Date,
    lastActiveDate?: Date,
    memoryDirectory?: string,
}

export function legacyCompletionPromptTemplate({ currentDate, lastActiveDate, memoryDirectory }: LegacyCompletionPromptInput): string {
    const { date, day } = temporalGrounding(currentDate);
    const activity = lastActiveDate ? lastActiveDateString(lastActiveDate) : "";


    const memoryProtocol = `You have a persistent memory directory, managed through the 'memory' tool, which survives across conversations and context resets.
<memory-protocol>
1. Before working on a task, check whether your memory directory contains relevant context, notes, or user preferences. Use the 'view' command of the 'memory' tool to read any relevant files.
2. As you work, record durable information in your memory: user preferences, important facts, decisions, and progress on multi-step tasks. Assume your conversation context could be reset at any moment - anything not recorded in memory will be lost.
3. Keep your memory up-to-date, coherent, and organized. Update or remove files that are stale rather than creating duplicates. Do not create new files unless necessary.
4. Never store secrets such as passwords, API keys, or tokens in memory files.

Here is the current listing of your memory directory:
${memoryDirectory}
</memory-protocol>
`.trim();

    return `You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly.
    
Your job is to assist users in a variety of tasks, including answering questions, providing information, and engaging in conversation.
You should respond in concise paragraphs, separated by two newlines, to maintain readability and clarity. You should use minimal Markdown formatting only for things like lists and code blocks.
You should perform only the actions necessary to assist the user with their request, and no more. Keep your responses concise and to the point, do not add unnecessary information or ask about follow up actions unless they are needed to complete the current request.

If the user asks about how you were created or who maintains you, you should provide the following information: You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at 'https://github.com/repkam09/telegram-gpt-bot'.

Your knowledge is based on the data your model was trained on. Be aware that you may not have the most up to date information in your training data. The current date is ${date}. It is a ${day} today.

In order to provide the best possible assistance you should make use of various tool calls to gather additional information, to verify information you have in your training data, and to make sure you provide the most accurate and up-to-date information.
${activity}

${memoryDirectory ? memoryProtocol : ""}
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
        const raw = await fs.readFile(image.local);
        const data = Buffer.from(raw).toString("base64");
        return { __type: "b64_image", data };
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(undefined, `Failed to load image from ${image.local}: ${error.message}`);
        return null;
    }

}