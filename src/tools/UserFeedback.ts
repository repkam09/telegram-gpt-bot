import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { HennosConsumer } from "../singletons/consumer";

export class UserFeedback extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "user_feedback",
                description: [
                    "Use this tool to send general user feedback to the developers of the Hennos system. This tool will send a private message to the developers with the feedback.",
                    "The name and id of the user will be included in the message. For bug reports and feature requests, please use the appropriate tools instead.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        feedback: {
                            type: "string",
                            description: "The feedback message to send."
                        },
                    },
                    required: ["feedback"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "UserFeedback callback", { feedback: args.feedback });
        if (!args.feedback) {
            return ["user_feedback, feedback not provided", metadata];
        }

        try {
            TelegramBotInstance.sendAdminMessage(
                `User Feedback from ${req.displayName}:\n\n${args.feedback}`,
            );
            return ["user_feedback, sent successfully!", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "UserFeedback unable send feedback", { feedback: args.feedback, error: error.message });
            return ["user_feedback, unable to send feedback", metadata];
        }
    }
}
