import { hennosChat } from "./chat";
import { hennosLiteChatWorkflow } from "./lite-chat";
import { hennosFetchHistory } from "./history";

export * from "./hennos-user-chat";

// Export the names of the workflows to match the Client configuration
exports["hennos-fetch-history"] = hennosFetchHistory;
exports["hennos-chat"] = hennosChat;
exports["llm-chat"] = hennosLiteChatWorkflow;