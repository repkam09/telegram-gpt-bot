import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { Config } from "../singletons/config";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { HennosConsumer } from "../singletons/consumer";

export class HomeAssistantStatesTool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.HOME_ASSISTANT_BASE_URL && Config.HOME_ASSISTANT_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "home_assistant_states",
                description: [
                    "This tool uses the Home Assistant API to retrieve the states of requested entities within Home Assistant.",
                    "Each entity will return the following properties: entity_id, state, last_changed and attributes. The attributes field contains additional information about the entity.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        entity_id: {
                            type: "string",
                            description: "The comma seperated list of entity_ids of the to fetch information for. Eg. 'zone.home' or 'zone.home,person.mark_repka'.",
                        }
                    },
                    required: ["entity_id"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        if (!args.entity_id) {
            return ["home_assistant_states error, required parameter 'entity_id' not provided", metadata];
        }

        const entity_ids: string[] = args.entity_id.split(",").map((entity_id: string) => entity_id.trim());

        Logger.info(req, "home_assistant_states", { entity_ids });
        try {
            const entities = await BaseTool.fetchJSONData<HomeAssistantEntityResult[]>(`${Config.HOME_ASSISTANT_BASE_URL}/api/states`, {
                "Authorization": `Bearer ${Config.HOME_ASSISTANT_API_KEY}`
            });

            const results: Record<string, unknown>[] = [];
            entities.forEach((entity_status) => {
                if (entity_ids.includes(entity_status.entity_id)) {
                    results.push({
                        "entity_id": entity_status.entity_id,
                        "state": entity_status.state,
                        "last_changed": entity_status.last_changed,
                        "attributes": entity_status.attributes
                    });
                }
            });

            Logger.debug(req, `HomeAssistantTool, results: ${JSON.stringify(results)}`);
            return [`HomeAssistantTool: ${JSON.stringify(results)}`, metadata];
        } catch (err: unknown) {
            Logger.error(req, `HomeAssistantTool error: ${err}`);
            return [`HomeAssistantTool unable to fetch entity_ids ${args.entity_id}`, metadata];
        }
    }
}


export class HomeAssistantEntitiesTool extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.HOME_ASSISTANT_BASE_URL && Config.HOME_ASSISTANT_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "home_assistant_entities",
                description: [
                    "This tool uses the Home Assistant API to retrieve the list of available entities within Home Assistant.",
                    "This is a useful tool to get a list of all entities and their respective entity_ids before fetching more detailed information."
                ].join(" "),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "The reason for fetching the list of entities. This is optional and can be used to provide context for the request."
                        }
                    },
                    "required": []
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "home_assistant_states");
        try {
            const entities = await BaseTool.fetchJSONData<HomeAssistantEntityResult[]>(`${Config.HOME_ASSISTANT_BASE_URL}/api/states`, {
                "Authorization": `Bearer ${Config.HOME_ASSISTANT_API_KEY}`
            });

            const invalidStates = ["unavailable", "unknown"];
            const availableEntities = entities.filter((entity) => !invalidStates.includes(entity.state)).map((entity) => entity.entity_id);

            Logger.debug(req, `HomeAssistantTool, available entity_ids: ${JSON.stringify(availableEntities)}`);
            return [`HomeAssistantTool, available entity_ids: ${JSON.stringify(availableEntities)}`, metadata];
        } catch (err: unknown) {
            Logger.error(req, `HomeAssistantTool all error: ${err}`);
            return ["HomeAssistantTool, unable to fetch available entity_ids", metadata];
        }
    }
}



type HomeAssistantEntityResult = {
    "entity_id": string,
    "state": string,
    "attributes": unknown,
    "last_changed": string,
    "last_reported": string,
    "last_updated": string,
    "context": unknown
}
