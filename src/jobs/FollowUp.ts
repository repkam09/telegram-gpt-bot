
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
            Logger.debug(undefined, "User not found");
            return;
        }

        Logger.debug(user, `Starting Follow Up for ${user.displayName}`);

        const context = await user.getChatContext(8);
        if (context.length === 0) {
            Logger.debug(user, "No chat context found");
            return;
        }

        const lastActive = await user.lastActive();
        if (!lastActive.message) {
            Logger.debug(user, "No last active message found");
            return;
        }

        if (lastActive.message.getTime() > Date.now() - 60 * 60 * 1000) {
            Logger.debug(user, "Last active message is less than an hour old");
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
                content: "You should only send a follow-up message if you think it is appropriate, timely, and clearly relates to the last few messages. If the last message from Hennos Assistant already appears to be a follow-up message, you should not send another one."
            },
            {
                role: "system",
                type: "text",
                content: `This follow up check will be performed every hour. The current time is ${new Date().toISOString()}. The last message from the user was at ${lastActive.message.toISOString()}.`
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

        const mini = await HennosOpenAISingleton.mini();
        const client = mini.client as OpenAI;

        const messages = convertHennosMessages(prompt);

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
                Logger.debug(user, "No follow up needed");
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
