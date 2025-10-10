import { condition, defineQuery, defineSignal, proxyActivities, setHandler, workflowInfo, continueAsNew } from "@temporalio/workflow";
import type * as activities from "../../temporal/activities";
import type OpenAI from "openai";
import type { HennosWorkflowProvider, HennosWorkflowUser } from "../types";

// Define the activities and options
const { chat } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minute",
});

const WAIT_TIME_MS = 60_000 * 60; // 60 minutes

type HennosUserChatInput = {
    user: HennosWorkflowUser;
    continueAsNewState?: {
        chatHistory: HennosUserChatHistoryMessage[];
        pendingMessages: { messageId: string; message: string }[];
    }
}

type HennosUserChatHistoryMessage = {
    messageId: string;
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam;
}

export const handleHennosUserMessage = defineSignal<[{ messageId: string, message: string }]>("handleHennosUserMessage");
const handleHennosUserSetProvider = defineSignal<[{ provider: HennosWorkflowProvider }]>("handleHennosUserSetProvider");
const handleHennosUserSetWhitelisted = defineSignal<[{ isWhitelisted: boolean }]>("handleHennosUserSetWhitelisted");
const handleHennosUserSetExperimental = defineSignal<[{ isExperimental: boolean }]>("handleHennosUserSetExperimental");
const handleHennosUserSetAdmin = defineSignal<[{ isAdmin: boolean }]>("handleHennosUserSetAdmin");
const handleHennosUserForceContinueAsNew = defineSignal("handleHennosUserForceContinueAsNew");

const queryHennosUserChatHistory = defineQuery<HennosUserChatHistoryMessage[], [number]>("queryHennosUserChatHistory");
export const queryHennosUserMessageHandled = defineQuery<false | string, [string]>("queryHennosUserMessageHandled");

export async function hennosUserChat(input: HennosUserChatInput): Promise<never> {
    const { user, continueAsNewState } = input;

    const pendingMessages: { messageId: string; message: string }[] = continueAsNewState ? continueAsNewState.pendingMessages : [];
    const chatHistory: HennosUserChatHistoryMessage[] = continueAsNewState ? continueAsNewState.chatHistory : [];

    let forceContinueAsNew = false;

    setHandler(handleHennosUserForceContinueAsNew, () => {
        forceContinueAsNew = true;
    });

    // Set up the query handler to get chat history
    setHandler(queryHennosUserChatHistory, (limit) => {
        return chatHistory.slice(-limit);
    });

    // Set up the query handler to check if a message has been handled
    setHandler(queryHennosUserMessageHandled, (messageId) => {
        const found = chatHistory.find((msg) => msg.messageId === messageId && msg.message.role === "assistant");
        return found ? found.message.content as string : false;
    });

    // Set up the signal handler to receive messages
    setHandler(handleHennosUserMessage, async ({ message, messageId }) => {
        pendingMessages.push({ messageId, message });
    });

    // Set up the signal handler to change provider
    setHandler(handleHennosUserSetProvider, async ({ provider }) => {
        user.provider = provider;
    });

    // Set up the signal handler to change whitelisted status
    setHandler(handleHennosUserSetWhitelisted, async ({ isWhitelisted }) => {
        user.isWhitelisted = isWhitelisted;
    });

    // Set up the signal handler to change experimental status
    setHandler(handleHennosUserSetExperimental, async ({ isExperimental }) => {
        user.isExperimental = isExperimental;
    });

    // Set up the signal handler to change admin status
    setHandler(handleHennosUserSetAdmin, async ({ isAdmin }) => {
        user.isAdmin = isAdmin;
    });

    function shouldContinueAsNew() {
        if (forceContinueAsNew) {
            return true;
        }

        if (user.isAdmin || user.isWhitelisted) {
            return workflowInfo().continueAsNewSuggested;
        }

        // If the user is not admin or whitelisted, limit history length to 20 messages
        return workflowInfo().continueAsNewSuggested || chatHistory.length > 20;
    }

    while (!shouldContinueAsNew()) {
        await condition(() => pendingMessages.length > 0 || forceContinueAsNew, WAIT_TIME_MS);

        const pendingMessage = pendingMessages.shift();
        if (!pendingMessage) {
            continue;
        }

        chatHistory.push({
            messageId: pendingMessage.messageId,
            message: {
                role: "user",
                content: pendingMessage.message
            }
        });

        const response = await chat(user, chatHistory.map((msg) => msg.message));
        if (response.finish_reason === "tool_calls" || response.finish_reason === "function_call") {
            throw new Error("Not Implemented: Handle tool calls.");
        }

        if (response.finish_reason == "length") {
            throw new Error("Not Implemented: Handle max token generation length.");
        }

        if (response.finish_reason === "content_filter") {
            chatHistory.push({
                messageId: pendingMessage.messageId,
                message: {
                    role: "assistant",
                    content: "I'm sorry, but I can't assist with that request."
                }
            });
            continue;
        }

        if (response.finish_reason === "stop") {
            // Only treat this as the final message if the user didnt send another message while we were generating
            if (pendingMessages.length == 0 && response.message.content) {
                chatHistory.push({
                    messageId: pendingMessage.messageId,
                    message: {
                        role: "assistant",
                        content: response.message.content
                    }
                });
            }
        }
    }

    // If we need to continueAsNew, we would do so here, compressing chatHistory if needed.
    // And pass along the pendingMessages if there are any.
    return continueAsNew<typeof hennosUserChat>({
        user,
        continueAsNewState: {
            chatHistory: chatHistory.slice(-10), // Keep only the last 10 messages for context
            pendingMessages,
        }
    });
}
