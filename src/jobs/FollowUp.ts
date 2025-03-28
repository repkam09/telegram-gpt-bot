
import { Logger } from "../singletons/logger";
import { convertHennosMessages, utilityRequest } from "../singletons/openai";
import { HennosUser } from "../singletons/user";
import { Job } from "./job";
import { Config } from "../singletons/config";
import { HennosTextMessage } from "../types";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { ScheduleJob } from "../singletons/cron";

export async function createFollowUpJobs() {
    Logger.debug(undefined, "Creating Follow Up Jobs");
    const users = Config.HENNOS_FOLLOW_UP_ENABLED;
    if (!users || users.length === 0) {
        Logger.debug(undefined, "No users found for Follow Up Jobs");
        return;
    }

    for (const userId of users) {
        const user = await HennosUser.exists(userId);
        if (!user) {
            Logger.error(undefined, `User ${userId} not found`);
            continue;
        }

        ScheduleJob.cron(user, FollowUp.schedule(), FollowUp.run, FollowUp.name);
    }
}


export class FollowUp extends Job {
    static schedule(): [string, string] {
        // Random minute in the hour. This is to prevent all users from being messaged at the same time
        const minute = Math.floor(Math.random() * 60);
        return [`${minute} * * * *`, "EST"];
    }

    static scheduled(): void {
        Logger.debug(undefined, "Scheduled Follow Up Job", FollowUp.schedule());
    }

    static async run(user: HennosUser) {
        Logger.debug(user, "Starting Follow Up Job");

        const context = await user.getChatContext(8);
        if (context.length === 0) {
            Logger.debug(user, "No chat context found");
            return;
        }

        const lastActive = await user.lastActive();
        if (!lastActive.user) {
            Logger.debug(user, "No last active user message found");
            return;
        }

        if (!lastActive.assistant) {
            Logger.debug(user, "No last active assistant message found");
            return;
        }

        // minutes since the last user message
        const userDate = new Date(lastActive.user.date.getTime());
        const userDateDiff = Math.floor((Date.now() - userDate.getTime()) / 1000 / 60);
        const userDateString = userDateDiff > 60 ? `${Math.floor(userDateDiff / 60)} hours` : `${userDateDiff} minutes`;


        // minutes since the last assistant message
        const assistantDate = new Date(lastActive.assistant.date.getTime());
        const assistantDateDiff = Math.floor((Date.now() - assistantDate.getTime()) / 1000 / 60);
        const assistantDateString = assistantDateDiff > 60 ? `${Math.floor(assistantDateDiff / 60)} hours` : `${assistantDateDiff} minutes`;


        // day of the week right now
        const dayOfWeek = new Date().getDay();
        const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

        const prompt: HennosTextMessage[] = [
            {
                role: "system",
                type: "text",
                content: "You are a specialized chat-analysis AI that is designed to help determine, from the last few messages with a user, if they should be sent a follow-up message or not."
            },
            {
                role: "system",
                type: "text",
                content: "You should only consider a follow-up message if you think it is very important and clearly relates to the last few messages. If the last message from Hennos Assistant already appears to be a follow-up message, you should not send another one."
            },
            {
                role: "system",
                type: "text",
                content: "Needing a follow-up message should be quite rare. If you are not sure, it is better to err on the side of caution and not send a follow-up message. Also consider time time of day and day of the week when determining if a follow-up message is needed."
            },
            {
                role: "system",
                type: "text",
                content: `This follow up check will be performed every hour. It has been ${userDateString} since the last message from the user. It has been ${assistantDateString} since the last message from Hennos Assistant.`,
            },
            {
                role: "system",
                type: "text",
                content: `It is currently ${dayOfWeekString}. The current time is ${new Date().toISOString()}.`
            },
            {
                role: "system",
                type: "text",
                content: `Here are the last few messages between the User, named ${user.displayName}, and the Hennos Assistant:`
            },
            {
                role: "system",
                type: "text",
                content: context.reduce((acc, message) => {
                    if (message.role === "user") {
                        if (message.type === "text") {
                            acc.push(`${user.displayName}: ${message.content}`);
                        } else {
                            acc.push(`${user.displayName} sent a ${message.type} message that has been omitted.`);
                        }
                    }

                    if (message.role === "assistant" && message.type === "text") {
                        acc.push(`Hennos Assistant: ${message.content}`);
                    }

                    return acc;
                }, [] as string[]).join("\n")
            },
            {
                role: "user",
                type: "text",
                content: "Should Hennos send a follow up message to the user? If so, what should it say?"
            }
        ];

        Logger.debug(user, "Sending follow up request to OpenAI", prompt);

        const result = await utilityRequest(user, {
            model: "gpt-4o-mini",
            messages: convertHennosMessages(prompt),
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
                                description: "The reason whether or not to send a follow up message."
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
                Logger.debug(user, "No follow up needed:", parsed.should_follow_up_reason);
            }

            if (parsed.should_follow_up && parsed.should_follow_up_reason) {
                Logger.info(user, `Follow Up: ${JSON.stringify(parsed)}`);
                if (parsed.follow_up_message) {
                    user.updateAssistantChatContext(parsed.follow_up_message);
                    await TelegramBotInstance.sendMessageWrapper(user, parsed.follow_up_message);
                }
            }
        } catch (err) {
            Logger.error(user, "Error parsing message from OpenAI", err);
            return;
        }
    }
}
