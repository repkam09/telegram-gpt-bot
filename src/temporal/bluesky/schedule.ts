import { BlueskyInstance } from "../../singletons/bluesky";
import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { reviewBlueskyWorkflow } from "./workflow";

const scheduleId = "bluesky-schedule";

export async function createBlueskyScheduleWorkflow() {
    BlueskyInstance.init(); // Ensure Bluesky is initialized before creating the schedule

    const client = await createTemporalClient();

    Logger.info(scheduleId, "Creating bluesky schedule workflow...");
    await deleteBlueskyScheduleWorkflow(); // Ensure no duplicate schedules

    await client.schedule.create({
        action: {
            type: "startWorkflow",
            workflowType: reviewBlueskyWorkflow,
            args: [],
            taskQueue: Config.TEMPORAL_TASK_QUEUE
        },
        scheduleId: scheduleId,
        spec: {
            intervals: [{
                every: "4 hours"
            }]
        }
    });

    Logger.info(scheduleId, "Bluesky schedule workflow created successfully.");
}

export async function deleteBlueskyScheduleWorkflow() {
    const client = await createTemporalClient();

    const schedules = [];

    const scheduleList = client.schedule.list();

    for await (const schedule of scheduleList) {
        schedules.push(schedule);
    }

    // Check if schedulealready exists
    if (schedules.find((schedule) => schedule.scheduleId === scheduleId)) {
        Logger.debug(scheduleId, "Schedule already exists, deleting...");
        const handle = client.schedule.getHandle(scheduleId);
        await handle.delete();
    }
}