
import { Logger } from "../singletons/logger";
import { convertHennosMessages, HennosOpenAISingleton } from "../singletons/openai";
import { HennosUser } from "../singletons/user";
import { Job } from "./job";
import { Config } from "../singletons/config";
import { HennosTextMessage } from "../types";
import OpenAI from "openai";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { ScheduleJob } from "../singletons/cron";

export async function createFollowUpJobs() {
    Logger.debug(undefined, "Creating Follow Up Jobs");
    const users = [Config.TELEGRAM_BOT_ADMIN];

    for (const userId of users) {
        const user = await HennosUser.exists(userId);
        if (!user) {
            Logger.error(undefined, `User ${userId} not found`);
            continue;
        }

        const schedule = FollowUp.schedule();
        ScheduleJob.cron("FollowUp", schedule, FollowUp.run, user.chatId);
    }
}


export class FollowUp extends Job {
    static schedule(): [string, string] {
        const minute = Math.floor(Math.random() * 60);
        return [`${minute} * * * *`, "EST"];
    }

    static scheduled(): void {
        Logger.debug(undefined, "Scheduled Follow Up Job", FollowUp.schedule());
    }

    static async run(userId: number) {
        const user = await HennosUser.exists(userId);
        if (!user) {
            Logger.error(undefined, "Admin user not found");
            return;
        }

        Logger.info(user, `Starting Follow Up for ${user.displayName}`);


        const context = await user.getChatContext(5);

        // If the last two messages are from the assistant, we should not send a follow up
        if (context.length > 1) {
            const previous1 = context[context.length - 1];
            const previous2 = context[context.length - 2];
            if (previous1.role === "assistant" && previous2.role === "assistant") {
                Logger.info(user, "No follow up needed, last two messages are from assistant");
                return;
            }
        }

        const lastActive = await user.lastActive();
        if (!lastActive.message) {
            Logger.error(user, "No last active message found");
            return;
        }

        const prompt: HennosTextMessage[] = [
            {
                role: "system",
                type: "text",
                content: "You are a specialized chat-analysis AI that is designed to help determine, from the last few messages with a user, if they should be sent a follow-up message or not."
            },
            {
                role: "system",
                type: "text",
                content: "This follow up message can be just checking in on them, sending them a message to remind them of something, or asking them how something they talked about previously went."
            },
            {
                role: "system",
                type: "text",
                content: "You should only send a follow-up message if you think it is appropriate, timely, and clearly relates to the last few messages."
            },
            {
                role: "system",
                type: "text",
                content: `This follow up check will be performed every hour. The current time is ${new Date().toISOString()}. The last message from the user was at ${lastActive.message.toISOString()}.`
            },
            {
                role: "system",
                type: "text",
                content: "Here is the last few messages between the User and the Hennos Assistant:"
            }
        ];

        const mini = await HennosOpenAISingleton.mini();
        const client = mini.client as OpenAI;

        const messages = convertHennosMessages([...prompt, ...context]);

        const result = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "follow-up-decision",
                    description: "Determine if a follow up message should be sent to the user based on the last few messages with them.",
                    schema: {
                        type: "object",
                        properties: {
                            should_follow_up: {
                                type: "boolean",
                                description: "Whether or not to send a follow up message."
                            },
                            should_follow_up_reason: {
                                type: "string",
                                description: "The reason weather or not to send a follow up message."
                            },
                            follow_up_message: {
                                type: "string",
                                description: "The follow up message to send to the user."
                            }
                        },
                        required: ["should_follow_up", "should_follow_up_reason"]
                    }
                }
            }
        });

        if (!result.choices || result.choices.length === 0) {
            Logger.error(user, "No choices returned from OpenAI");
            return;
        }

        if (!result.choices[0].message) {
            Logger.error(user, "No message returned from OpenAI");
            return;
        }

        const message = result.choices[0].message.content;
        if (!message) {
            Logger.error(user, "No message content returned from OpenAI");
            return;
        }

        // Message should match the schema
        try {
            const parsed = JSON.parse(message) as {
                should_follow_up: boolean;
                should_follow_up_reason: string;
                follow_up_message: string;
            };


            if (!parsed.should_follow_up) {
                Logger.info(user, "No follow up needed");
            }

            if (parsed.should_follow_up && parsed.should_follow_up_reason) {
                Logger.info(user, `Follow up needed: ${parsed.should_follow_up_reason}`);
                if (parsed.follow_up_message) {
                    user.updateAssistantChatContext(parsed.follow_up_message);

                    Logger.info(user, `Follow up message: ${parsed.follow_up_message}`);
                    await TelegramBotInstance.sendMessageWrapper(user, parsed.follow_up_message);
                }
            }
        } catch (err) {
            Logger.error(user, "Error parsing message from OpenAI", err);
            return;
        }
    }
}
