import { Logger } from "../../singletons/logger";

export type MemoryEventInput = {
    role: "user" | "assistant";
    content: string;
    date: string;
}

export type Memory = UserPreferenceMemory | SemanticMemory

export type UserPreferenceMemory = {
    type: "user_preference";
    memoryId: string;
    category: string,
    preference: string;
    context: string
}

export type SemanticMemory = {
    type: "semantic";
    memoryId: string;
    subject: string;
    predicate: string;
    object: string;
    context: string;
}


export function MemoryEventInputToXML(input: MemoryEventInput): string {
    return `<event role="${input.role}" date="${input.date}">
${input.content}
</event>`;
}

export function MemoryToXML(memory: Memory): string {
    if (memory.type === "semantic") {
        return `<memory type="semantic" memoryId="${memory.memoryId}">
<subject>${memory.subject}</subject>
<predicate>${memory.predicate}</predicate>
<object>${memory.object}</object>
<context>${memory.context}</context>
</memory>`;
    }

    if (memory.type === "user_preference") {
        return `<memory type="user_preference" memoryId="${memory.memoryId}">
<category>${memory.category}</category>
<preference>${memory.preference}</preference>
<context>${memory.context}</context>
</memory>`;
    }

    Logger.warn(undefined, "Unknown memory type during XML conversion: " + JSON.stringify(memory));
    return "";
}
