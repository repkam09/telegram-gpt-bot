import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { ScheduleJob } from "../singletons/cron";
import { HennosGroup } from "../singletons/group";
import { HennosUser } from "../singletons/user";

export class ScheduleMessageCallback extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "schedule_message_callback",
                description: [
                    "This tool will schedule a callback to send a message to the user in the future. This is useful for reminders, notifications, or other messages that should be sent at a specific time.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        futureMinutes: {
                            type: "number",
                            description: "The number of minutes in the future to schedule the callback for."
                        },
                        message: {
                            type: "string",
                            description: "This prompt will be sent to you, the assistant, when the callback is triggered. You should use this prompt to specify what you want the assistant to do when the callback is triggered."
                        }
                    },
                    required: ["futureMinutes", "message"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "ScheduleMessageCallback callback", { futureMinutes: args.futureMinutes, message: args.message });
        if (!args.futureMinutes || args.futureMinutes < 1) {
            return ["schedule_message_callback failed, futureMinutes must be a positive number", metadata];
        }

        if (!args.message || args.message.length === 0) {
            return ["schedule_message_callback failed, message must be a non-empty string", metadata];
        }

        if (req instanceof HennosGroup) {
            return ["schedule_message_callback failed, this tool is not available in group chats", metadata];
        }

        const futureDate = new Date(Date.now() + args.futureMinutes * 60 * 1000);
        const user = req as HennosUser;
        await ScheduleJob.schedule(futureDate, user, args.message);

        return [`schedule_message_callback created, scheduled for ${futureDate}.`, metadata];
    }
}