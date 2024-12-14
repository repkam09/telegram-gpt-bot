import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export class AcknowledgeWithoutResponse extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "acknowledge_without_response",
                description: [
                    "This tool will acknowledge the user's input, by sending a thumbs-up reaction, without sending an actual text response. Processing of the current input will stop.",
                    "This tool is useful when the user's input does not require a response, such as when the user is taking notes, making a list, or otherwise clearly expects no reply."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        reason: {
                            type: "string",
                            description: "The reason for acknowledging without responding, such as 'user taking notes' or 'expects no reply'. This information is logged for reference."
                        }
                    },
                    required: ["reason"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "AcknowledgeWithoutResponse callback", { reason: args.reason });
        return ["acknowledge_without_response", metadata, "empty"];
    }
}