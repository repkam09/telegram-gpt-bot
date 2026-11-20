import { ScheduleOverlapPolicy } from "@temporalio/client";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { memoryBatchWorkflow } from "./workflow";

const scheduleId = "memory-batch";

export async function createMemoryBatchSchedule(): Promise<void> {
    const client = await createTemporalClient();

    Logger.info(scheduleId, "Creating memory batch schedule...");
    await deleteMemoryBatchSchedule(); // Ensure no duplicate schedules and that config changes apply

    await client.schedule.create({
        action: {
            type: "startWorkflow",
            workflowType: memoryBatchWorkflow,
            args: [],
            taskQueue: Config.TEMPORAL_TASK_QUEUE,
        },
        scheduleId,
        spec: {
            cronExpressions: [Config.HENNOS_MEMORY_SCHEDULE_CRON],
            timezone: Config.HENNOS_MEMORY_SCHEDULE_TZ,
        },
        policies: {
            overlap: ScheduleOverlapPolicy.SKIP,
            catchupWindow: "1 hour",
        },
    });

    Logger.info(scheduleId, `Memory batch schedule created (${Config.HENNOS_MEMORY_SCHEDULE_CRON} ${Config.HENNOS_MEMORY_SCHEDULE_TZ}).`);
}

export async function deleteMemoryBatchSchedule(): Promise<void> {
    const client = await createTemporalClient();

    for await (const schedule of client.schedule.list()) {
        if (schedule.scheduleId === scheduleId) {
            Logger.debug(scheduleId, "Schedule already exists, deleting...");
            await client.schedule.getHandle(scheduleId).delete();
            return;
        }
    }
}
