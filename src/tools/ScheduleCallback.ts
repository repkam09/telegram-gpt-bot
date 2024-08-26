import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { ScheduleJob } from "../singletons/cron";


export class ScheduleCallback extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "schedule_callback",
                description: [
                    "This tool is used to schedule a callback at a future time. The callback will be executed at the specified time. This can be used to remind the user to do something or to follow up on a previous conversation at a later date.",
                    "You should ask the user for confirmation before scheduling a callback.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        callback_prompt: {
                            type: "string",
                            description: "The message to prompt yourself with when the callback is executed, this will provide instruction and context for the callback.",
                        },
                        callback_time: {
                            type: "string",
                            description: "The date and time to execute the callback in UTC time. This should be a date and time in ISO 8601 format.",
                        }
                    },
                    required: ["callback_prompt"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "ScheduleCallback callback", { callback_prompt: args.callback_prompt, callback_time: args.callback_time });
        if (!args.callback_prompt) {
            return ["schedule_callback, callback_prompt not provided", metadata];
        }

        if (!args.callback_time) {
            return ["schedule_callback, callback_time not provided", metadata];
        }

        try {
            await ScheduleJob.scheduleJob(req, args.callback_time, args.callback_prompt,);
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "ScheduleCallback unable to send admin message", { callback_prompt: args.callback_prompt, err: error.message });
        }

        return [`schedule_callback created, you will be send the specified prompt at ${args.callback_time}`, metadata];
    }
}