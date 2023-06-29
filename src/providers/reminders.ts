import { FuncParams, Functions } from "../singletons/functions";
import { Schedule } from "../singletons/schedule";
import { BotInstance } from "../singletons/telegram";
import { formatResponse } from "./common";

export default function init() {
    Functions.skip_register({
        name: "set_reminder_at_date_time",
        description: "Sets up a reminder to message the user at a specific time and date",
        parameters: {
            type: "object",
            properties: {
                date: {
                    type: "string",
                    format: "date",
                    description: "The date to set the reminder for. Eg, 2018-11-13"
                },
                time: {
                    type: "string",
                    format: "time",
                    description: "The time, in UTC, to set the reminder for. Eg, 20:20:39+00:00"
                },
                message: {
                    type: "string",
                    description: "The message to send the user when the reminder triggers"
                },
            },
            required: [
                "date",
                "time",
                "message",
            ]
        }
    }, set_reminder_at_date_time);
}

async function set_reminder_at_date_time(chatId: number, options: FuncParams) {
    const trigger = new Date(`${options.date}${options.time}`);
    Schedule.register(trigger, async () => {
        BotInstance.instance().sendMessage(chatId, options.message as string);
    }, "reminder_at_date_time");

    return formatResponse(options, `Your reminder for ${options.message} has been set for ${options.date} at ${options.time}`, "");
}