import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

export class Base64Decode extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "base64_decode",
                description: [
                    "This tool takes a base64 encoded string and decodes it to a utf-8 string.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        encoded: {
                            type: "string",
                            description: "The base64 encoded string to decode."
                        }
                    },
                    required: ["encoded"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "Base64Decode callback", { encoded: args.encoded });
        try {
            const result = Buffer.from(args.encoded, "base64").toString("utf-8");
            return [result, metadata];
        } catch (err: unknown) {
            Logger.error(req, `Base64Decode error: ${err}`);
            const error = err as Error;
            return [`Unable to decode input. Error: ${error.message}`, metadata];
        }
    }
}
