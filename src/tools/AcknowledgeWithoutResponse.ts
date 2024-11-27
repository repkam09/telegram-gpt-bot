import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export class AcknowledgeWithoutResponse extends BaseTool {
    public static functionName() {
        return "acknowledge_without_response";
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: this.functionName(),
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
        this.start(req, args);
        return this.success(req, "Success", metadata, "empty");
    }
}