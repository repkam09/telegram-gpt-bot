import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { TelegramBotInstance } from "../services/telegram/telegram";

export class MetaFeatureRequest extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "feature_request",
                description: [
                    "This tool is used to request a new feature in the Hennos system itself. If a user has an idea for a new feature,",
                    "or requests Hennos do something that it does not currently support,",
                    "this tool can be used to log the request for later review by the developer."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        request: {
                            type: "string",
                            description: "The feature request to log.",
                        },
                    },
                    required: ["request"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
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