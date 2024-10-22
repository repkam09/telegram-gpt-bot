import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { TelegramBotInstance } from "../services/telegram/telegram";

export class MetaFeatureRequest extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "feature_request",
                description: [
                    "Use this tool to propose a new feature or enhancement for the Hennos system.",
                    "If a user suggests an idea or requests functionality that Hennos does not currently support,",
                    "utilize this tool to log the request for the development team's evaluation and potential inclusion in future updates."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        request: {
                            type: "string",
                            description: "The detailed description of the feature request to be logged."
                        },
                    },
                    required: ["request"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "MetaFeatureRequest callback", { request: args.request });
        if (!args.request) {
            return ["feature_request, request not provided", metadata];
        }

        try {
            await TelegramBotInstance.sendAdminMessage(`Feature Request Tool (${req.displayName}):\n\n${args.request}`);
        } catch (err) {
            Logger.error(req, "MetaFeatureRequest unable to send admin message", { request: args.request });
        }

        return ["feature_request created", metadata];
    }
}