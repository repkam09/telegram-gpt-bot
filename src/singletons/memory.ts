export class ChatMemory {
    static _chat_context_map = new Map();
    static _id_to_name = new Map();
    static _id_to_llm = new Map();

    static get Context() {
        return ChatMemory._chat_context_map;
    }

    static get IdToName() {
        return ChatMemory._id_to_name;
    }

    static get IdToLLM() {
        return ChatMemory._id_to_llm;
    }

    static MAX_MESSAGE_MEMORY = 20;
}