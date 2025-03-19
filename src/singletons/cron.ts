import { handlePrivateMessage } from "../handlers/text/private";
import { handleHennosResponse } from "../services/telegram/telegram";
import NodeCron from "node-cron";
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

    public static async schedule(trigger: Date, user: HennosUser, message: string): Promise<number> {
        Logger.debug(undefined, `Scheduling message to ${user.chatId} at ${trigger}: ${message}`);
        const task = await Database.instance().futureTask.create({
            data: {
                chatId: user.chatId,
                message,
                trigger,
            },
            select: {
                id: true
            }
        });

        ScheduleJob._queue.push({ taskId: task.id, trigger, chatId: user.chatId, message });
        return task.id;
    }

    public static async cron(name: string, schedule: [string, string], run: (userId: number) => Promise<void>, userId: number) {
        const [cronTime, timezone] = schedule;
        Logger.debug(undefined, `Scheduling job ${name} at ${cronTime} ${timezone} for user ${userId}`);
        NodeCron.schedule(cronTime, async () => {
            Logger.debug(undefined, `Running scheduled job ${name} for user ${userId}`);
            await run(userId);
        }, {
            scheduled: true,
            timezone
        });
    }

    private static async processQueue() {
        if (ScheduleJob._queue.length === 0) {
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
            const user = await HennosUser.exists(task.chatId);
            if (user) {
                Logger.trace(user, "scheduled_task");
                const result = await handlePrivateMessage(user, task.message, {
                    type: "text",
                    content: "The latest message is being sent, on behalf of the user, as part of a scheduled message callback.",
                    role: "system"
                });

                await remove(task);
                return handleHennosResponse(user, result, {});
            }

            Logger.error(undefined, `Scheduled message failed to send to ${task.chatId}. User not found.`);
            await remove(task);
        }
    }
}

async function remove(task: FutureTask) {
    Logger.debug(undefined, `Deleting task ${task.taskId}`);
    await Database.instance().futureTask.delete({
        where: {
            id: task.taskId
        }
    });
}