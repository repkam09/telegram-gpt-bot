import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Database } from "../singletons/sqlite";

export class StoreKeyValueMemory extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }
    
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "store_key_value_memory",
                description: [
                    "Use this tool to store facts, information, or other important details related to a user.",
                    "This tool is designed to help the system remember and recall user-specific information for future interactions.",
                    "This information will automatically be made available to the system on future interactions with the same user.",
                    "If the 'key' already exists, the 'value' will be updated with the new content provided.",
                    "If 'value' is not provided, the existing key-value pair will be removed.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "The key or identifier for the fact to be stored. If the key already exists, the value will be updated.",
                        },
                        value: {
                            type: "string",
                            description: "The value or content of the fact to be stored. If omitted, the key-value pair will be removed.",
                        },
                    },
                    required: ["key"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "StoreKeyValueMemory callback", { args: args });
        if (!args.key) {
            return ["store_key_value_memory, Error: key not provided.", metadata];
        }

        try {
            const database = Database.instance();
            if (args.value) {
                await database.keyValueMemory.upsert({
                    where: {
                        chatId_key: {
                            chatId: req.chatId, key: args.key
                        }
                    },
                    update: { value: args.value },
                    create: { key: String(args.key), value: String(args.value), chatId: req.chatId }
                });
                return [`store_key_value_memory, success! key='${args.key}', value='${args.value}'`, metadata];
            }

            if (!args.value) {
                const exists = await database.keyValueMemory.findUnique({
                    where: {
                        chatId_key: {
                            chatId: req.chatId, key: args.key
                        }
                    }
                });
                
                if (!exists) {
                    return [`store_key_value_memory, success! key='${args.key}' does not exist in the database.`, metadata];
                }

                await database.keyValueMemory.delete({
                    where: {
                        chatId_key: {
                            chatId: req.chatId, key: args.key
                        }
                    }
                });
                return [`store_key_value_memory, success! key='${args.key}' was removed from the database.`, metadata];
            }

        } catch (err) {
            Logger.error(req, "StoreKeyValueMemory unable to store information", { key: args.key, value: args.value, err: err });
        }

        return ["store_key_value_memory, Error: unable to store key value pair.", metadata];
    }
}