import { BedrockAgentCoreClient, CreateEventCommand, ListMemoryRecordsCommand, Role } from "@aws-sdk/client-bedrock-agentcore";
import { Logger } from "./logger";
import { Config } from "./config";

export class AgentCoreInstance {

    private static _instance: BedrockAgentCoreClient | null = null;

    public static init() {
        if (this._instance) {
            Logger.warn("AgentCoreInstance is already initialized.");
            return;
        }

        this._instance = new BedrockAgentCoreClient({
            region: Config.BEDROCK_REGION,
            credentials: {
                accessKeyId: Config.BEDROCK_ACCESS_KEY_ID,
                secretAccessKey: Config.BEDROCK_SECRET_ACCESS_KEY,
                sessionToken: Config.BEDROCK_SESSION_TOKEN,
            }
        });
    }


    public static async listMemoryRecords(strategy: string, actorId: string): Promise<void> {
        if (!this._instance) {
            throw new Error("AgentCoreInstance is not initialized. Call AgentCoreInstance.init() first.");
        }

        Logger.debug("AgentCore", `Listing memory records for strategy: ${strategy} and actorId: ${actorId}`);
        await this._instance.send(new ListMemoryRecordsCommand({
            memoryId: Config.BEDROCK_MEMORY_ID,
            namespace: `/${strategy}/${actorId}/`,
        }));
    }

    public static async createEvent(actorId: string, sessionId: string, conversation: { text: string, role: "user" | "assistant" }[]): Promise<void> {
        if (!this._instance) {
            throw new Error("AgentCoreInstance is not initialized. Call AgentCoreInstance.init() first.");
        }

        Logger.debug("AgentCore", `Creating event for actorId: ${actorId} with content: ${conversation.map(c => c.text).join(", ")}`);
        await this._instance.send(new CreateEventCommand({
            memoryId: Config.BEDROCK_MEMORY_ID,
            actorId,
            sessionId,
            eventTimestamp: new Date(),
            payload: conversation.map((entry) => ({
                conversational: {
                    role: entry.role === "user" ? Role.USER : Role.ASSISTANT,
                    content: {
                        text: entry.text,
                    }
                }
            }))
        }));
    }

}