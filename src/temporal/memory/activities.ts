import { heartbeat } from "@temporalio/activity";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { withActivityHeartbeat } from "../heartbeat";
import { ChatMemoryResult, processChat } from "./process";
import { chatsWithNewMessages } from "./state";

export type MemoryChatList = {
    chatIds: string[];
    concurrency: number;
}

export async function listChatsWithNewMessages(): Promise<MemoryChatList> {
    if (!Config.HENNOS_MEMORY_DECISION_MODEL) {
        Logger.warn("MemoryBatch", "No memory decision model configured (HENNOS_MEMORY_DECISION_MODEL or HENNOS_CLASSIFIER_DECISION_MODEL), skipping the memory run");
        return { chatIds: [], concurrency: Config.HENNOS_MEMORY_CONCURRENCY };
    }

    const chatIds = await chatsWithNewMessages();
    Logger.info("MemoryBatch", `${chatIds.length} chats have new messages for memory extraction`);
    return { chatIds, concurrency: Config.HENNOS_MEMORY_CONCURRENCY };
}

export const processChatMemory = withActivityHeartbeat(_processChatMemory);
async function _processChatMemory(chatId: string): Promise<ChatMemoryResult> {
    return processChat(chatId, () => heartbeat());
}
