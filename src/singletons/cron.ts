import { TelegramBotInstance } from "../services/telegram/telegram";
import { HennosGroup } from "./group";
import { Logger } from "./logger";
import { Database } from "./sqlite";
import { HennosUser } from "./user";

type FutureTask = {
    taskId: number
    trigger: Date
    chatId: number
    message: string
}

export class ScheduleJob {
    public static _queue: FutureTask[] = [];

    public static async init() {
        const existingTasks = await Database.instance().futureTask.findMany({
            select: {
                id: true,
                chatId: true,
                message: true,
                trigger: true
            }
        });

        Logger.debug(undefined, `Found ${existingTasks.length} existing scheduled tasks.`);

        existingTasks.forEach((task) => ScheduleJob._queue.push({ taskId: task.id, chatId: Number(task.chatId), message: task.message, trigger: task.trigger }));
        setInterval(ScheduleJob.processQueue, 60 * 1000);
    }

    public static async schedule(trigger: Date, chatId: number, message: string): Promise<number> {
        Logger.debug(undefined, `Scheduling message to ${chatId} at ${trigger}: ${message}`);
        const task = await Database.instance().futureTask.create({
            data: {
                chatId,
                message,
                trigger,
            },
            select: {
                id: true
            }
        });

        ScheduleJob._queue.push({ taskId: task.id, trigger, chatId, message });
        return task.id;
    }

    private static async processQueue() {
        if (ScheduleJob._queue.length === 0) {
            Logger.debug(undefined, "No scheduled messages to process.");
            return;
        }

        const now = new Date();
        const readyTasks = ScheduleJob._queue.filter(task => task.trigger <= now);
        ScheduleJob._queue = ScheduleJob._queue.filter(task => task.trigger > now);

        if (readyTasks.length > 0) {
            Logger.debug(undefined, `Processing ${readyTasks.length} scheduled messages. ${ScheduleJob._queue.length} tasks remaining.`);
        } else {
            Logger.debug(undefined, `No scheduled messages to process. ${ScheduleJob._queue.length} tasks remaining.`);
        }

        for (const task of readyTasks) {
            Logger.debug(undefined, `Sending message to ${task.chatId}: ${task.message}`);

            const user = await HennosUser.exists(task.chatId);
            if (user) {
                Logger.info(user, "Sending scheduled message");
                await user.updateChatContext("assistant", task.message);
                await TelegramBotInstance.sendMessageWrapper(user, task.message);
            }

            const group = await HennosGroup.exists(task.chatId);
            if (group) {
                Logger.info(group, "Sending scheduled message");
                await group.updateChatContext("assistant", task.message);
                await TelegramBotInstance.sendMessageWrapper(group, task.message);
            }

            Logger.debug(undefined, `Deleting task ${task.taskId}`);
            await Database.instance().futureTask.delete({
                where: {
                    id: task.taskId
                }
            });
        }
    }
}