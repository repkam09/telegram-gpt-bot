import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";

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

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `UserFeedback callback. ${JSON.stringify({ feedback: args.feedback })}`);
        if (!args.feedback) {
            return ["user_feedback, feedback not provided", metadata];
        }

        try {
            // @TODO: Handle sending feedback to developers in a better way.
            Logger.info(workflowId, `User Feedback from ${workflowId}:\n\n${args.feedback}`);

            return ["user_feedback, sent successfully!", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(workflowId, `UserFeedback unable send feedback. ${JSON.stringify({ feedback: args.feedback, error: error.message })}`, error);
            return ["user_feedback, unable to send feedback", metadata];
        }
    }
}
