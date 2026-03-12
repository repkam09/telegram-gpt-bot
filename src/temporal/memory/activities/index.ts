import { Context } from "@temporalio/activity";
import { Memory, MemoryEventInput, MemoryEventInputToXML, MemoryToXML, SemanticMemory, UserPreferenceMemory } from "../types";
import { HennosTool } from "../../../provider";
import { Logger } from "../../../singletons/logger";
import { HennosOpenAISingleton } from "../../../singletons/openai";
import { randomUUID } from "node:crypto";
import { Config } from "../../../singletons/config";
import { StringValue } from "@temporalio/common";

type PersistMemoryEventsInput = {
    sessionId: string;
    userId: string;
    events: MemoryEventInput[];
}

export type MemoryExtractionWorkflowConfig = {
    timeout: StringValue | number;
}

export async function memoryExtractionWorkflowConfig(): Promise<MemoryExtractionWorkflowConfig> {
    return {
        timeout: Config.HENNOS_DEVELOPMENT_MODE ? "3 minutes" : "4 hours",
    };
}

export async function persistMemoryEvents(input: PersistMemoryEventsInput): Promise<void> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    // 1. Search the MemoryDataStore for existing memory entries related to
    //    things in the events (e.g. entities, topics, etc.)

    const existing: Memory[] = await MemoryDataStore.search(input.userId, input.events);

    // 2. Call an LLM with a prompt that includes the new events and the existing memory entries
    //    and ask it to extract any new memory entries and update existing ones as needed

    const model = HennosOpenAISingleton.low();
    const promptTemplate = memoryExtractionPromptTemplate({
        sessionId: input.sessionId,
        userId: input.userId,
        events: input.events,
        existing,
    });

    const tools = memoryExtractionTools();

    const response = await model.invoke(workflowId, [
        { role: "user", content: promptTemplate, type: "text" },
    ], tools);

    if (response.__type === "string") {
        throw new Error("Unexpected string response from memory extraction LLM");
    }

    // 3. Parse the LLM response and update the MemoryDataStore with any new or updated memory entries
    //    based on the memory add, update, and remove tool calls the LLM generated.
    response.payload.forEach((payload) => {
        Logger.info(workflowId, `Memory Extraction LLM Response Entry: ${JSON.stringify(payload)}`);

        switch (payload.name) {
            case "SemanticMemory": {
                const parsed = JSON.parse(payload.input);
                if (MemoryDataStoreValidator.validateSemanticMemoryPayload(parsed)) {
                    MemoryDataStore.add(input.userId, {
                        ...parsed,
                        type: "semantic",
                        memoryId: randomUUID(),
                    });
                }
                break;
            }

            case "PreferenceMemory": {
                const parsed = JSON.parse(payload.input);
                if (MemoryDataStoreValidator.validatePreferenceMemoryPayload(parsed)) {
                    MemoryDataStore.add(input.userId, {
                        ...parsed,
                        type: "user_preference",
                        memoryId: randomUUID(),
                    });
                }
                break;
            }
        }
    });
}

function memoryExtractionTools(): HennosTool[] {
    return [
        {
            type: "function",
            function: {
                "name": "SemanticMemory",
                "description": "Store a factual relationship between two entities. Use multi-tool calling to record multiple facts.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "subject": {
                            "type": "string",
                            "description": "The entity the fact is about"
                        },
                        "predicate": {
                            "type": "string",
                            "description": "The relationship or attribute"
                        },
                        "object": {
                            "type": "string",
                            "description": "The related entity or value"
                        },
                        "context": {
                            "type": "string",
                            "description": "Supporting context or source of this fact"
                        }
                    },
                    "required": ["subject", "predicate", "object"]
                }
            }
        },
        {
            type: "function",
            function: {
                "name": "PreferenceMemory",
                "description": "Store the user's preference",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": { "type": "string" },
                        "preference": { "type": "string" },
                        "context": { "type": "string" }
                    },
                    "required": ["category", "preference", "context"]
                }
            }
        },
        {
            type: "function",
            function: {
                "name": "RemoveMemory",
                "description": "Use this tool to remove (delete) a memory by its ID.",
                "parameters": {
                    "type": "object",
                    "required": ["memoryId"],
                    "properties": {
                        "memoryId": {
                            "type": "string",
                            "description": "ID of the memory to remove."
                        }
                    }
                }
            }
        },
        {
            type: "function",
            function: {
                "name": "UpdatePreferenceMemory",
                "description": "Use this tool to update an existing PreferenceMemory memory by its ID. You can update one or more fields of the memory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "memoryId": {
                            "type": "string",
                            "description": "ID of the memory to update."
                        },
                        "category": { "type": "string" },
                        "preference": { "type": "string" },
                        "context": { "type": "string" }
                    },
                    "required": ["memoryId"],
                }
            }
        },
        {
            type: "function",
            function: {
                "name": "UpdateSemanticMemory",
                "description": "Use this tool to update an existing SemanticMemory memory by its ID. You can update one or more fields of the memory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "memoryId": {
                            "type": "string",
                            "description": "ID of the memory to update."
                        },
                        "subject": {
                            "type": "string",
                            "description": "The entity the fact is about"
                        },
                        "predicate": {
                            "type": "string",
                            "description": "The relationship or attribute"
                        },
                        "object": {
                            "type": "string",
                            "description": "The related entity or value"
                        },
                        "context": {
                            "type": "string",
                            "description": "Supporting context or source of this fact"
                        }
                    },
                    "required": ["memoryId"]
                }
            }
        },
    ];
}


type MemoryExtractionPromptInput = {
    sessionId: string;
    userId: string;
    events: MemoryEventInput[];
    existing: Memory[];
}

export function memoryExtractionPromptTemplate(input: MemoryExtractionPromptInput): string {
    return `You are a long-term memory manager maintaining a core store of semantic, procedural, and episodic memory. These memories power a life-long learning agent's core predictive model.

What should the agent learn from this interaction about the user, itself, or how it should act? Reflect on the input trajectory and current memories (if any).

1. **Extract & Contextualize**
   - Identify essential facts, relationships, preferences, reasoning procedures, and context
   - Caveat uncertain or suppositional information with confidence levels (p(x)) and reasoning
   - Quote supporting information when necessary

2. **Compare & Update**
   - Attend to novel information that deviates from existing memories and expectations.
   - Consolidate and compress redundant memories to maintain information-density; strengthen based on reliability and recency; maximize SNR by avoiding idle words.
   - Remove incorrect or redundant memories while maintaining internal consistency

3. **Synthesize & Reason**
   - What can you conclude about the user, agent ("I"), or environment using deduction, induction, and abduction?
   - What patterns, relationships, and principles emerge about optimal responses?
   - What generalizations can you make?
   - Qualify conclusions with probabilistic confidence and justification

As the agent, record memory content exactly as you'd want to recall it when predicting how to act or respond.
Prioritize retention of surprising (pattern deviation) and persistent (frequently reinforced) information, ensuring nothing worth remembering is forgotten and nothing false is remembered. Prefer dense, complete memories over overlapping ones.

Here is the new information to learn from this interaction:
<session id="${input.sessionId}" userId="${input.userId}">
${input.events.map(MemoryEventInputToXML).join("\n")}
</session>

Here are the existing relevant memories you have (if any):
<existing>
${input.existing.map(MemoryToXML).join("\n")}
</existing>
`;

}

export class MemoryDataStore {

    private static memories: Map<string, Memory[]> = new Map<string, Memory[]>();

    public static async search(userId: string, events: MemoryEventInput[]): Promise<Memory[]> {
        if (!Config.HENNOS_MEMORY_ENABLED) {
            return [];
        }

        Logger.debug(undefined, `Searching memory store for user ${userId} with events: ${JSON.stringify(events)}`);
        return MemoryDataStore.memories.get(userId) || [];
    }

    public static async searchSemantic(userId: string, queries: string[]): Promise<Memory[]> {
        if (!Config.HENNOS_MEMORY_ENABLED) {
            return [];
        }

        Logger.debug(undefined, `Searching semantic memories for user ${userId} with queries: ${JSON.stringify(queries)}`);
        return MemoryDataStore.memories.get(userId) || [];
    }

    public static async add(userId: string, memory: Memory): Promise<void> {
        Logger.debug(undefined, `Adding memory to store: ${JSON.stringify(memory)}`);
        if (!MemoryDataStore.memories.has(userId)) {
            MemoryDataStore.memories.set(userId, []);
        }

        MemoryDataStore.memories.get(userId)!.push(memory);
    }

    public static async update(userId: string, memoryId: string, updates: Partial<Memory>): Promise<void> {
        Logger.debug(undefined, `Updating memory ${memoryId} with updates: ${JSON.stringify(updates)}`);
        if (!MemoryDataStore.memories.has(userId)) {
            MemoryDataStore.memories.set(userId, []);
        }

        const index = MemoryDataStore.memories.get(userId)!.findIndex(m => m.memoryId === memoryId);
        Logger.debug(undefined, `Found memory index: ${index}`);
    }

    public static async remove(userId: string, memoryId: string): Promise<void> {
        Logger.debug(undefined, `Removing memory ${memoryId} from store`);

        if (!MemoryDataStore.memories.has(userId)) {
            MemoryDataStore.memories.set(userId, []);
        }

        const index = MemoryDataStore.memories.get(userId)!.findIndex(m => m.memoryId === memoryId);
        if (index !== -1) {
            MemoryDataStore.memories.get(userId)!.splice(index, 1);
        } else {
            Logger.warn(undefined, `Memory with ID ${memoryId} not found for removal.`);
        }
    }
}


class MemoryDataStoreValidator {
    public static validateSemanticMemoryPayload(input: Record<string, string>): input is Omit<SemanticMemory, "type" | "memoryId"> {
        if (typeof input.subject !== "string" || typeof input.predicate !== "string" || typeof input.object !== "string") {
            return false;
        }

        if (input.context && typeof input.context !== "string") {
            return false;
        }

        return true;
    }

    public static validatePreferenceMemoryPayload(input: Record<string, string>): input is Omit<UserPreferenceMemory, "type" | "memoryId"> {
        if (typeof input.category !== "string" || typeof input.preference !== "string") {
            return false;
        }

        if (input.context && typeof input.context !== "string") {
            return false;
        }

        return true;
    }
}