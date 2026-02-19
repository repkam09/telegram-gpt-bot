import { Config } from "../../singletons/config";
import { GmailInstance } from "../../singletons/gmail";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { reviewEmailWorkflow } from "./workflow";

export async function createEmailScheduleWorkflow() {
    GmailInstance.init(); // Ensure Gmail is initialized before creating the schedule

    const scheduleId = "email-schedule";

    Logger.info(scheduleId, "Creating email schedule workflow...");
    const client = await createTemporalClient();

    const schedules = [];

    const scheduleList = client.schedule.list();

    for await (const schedule of scheduleList) {
        schedules.push(schedule);
    }

    // Check if email-schedule already exists
    if (schedules.find((schedule) => schedule.scheduleId === scheduleId)) {
        Logger.debug(scheduleId, "Schedule already exists, deleting...");
        const handle = client.schedule.getHandle(scheduleId);
        await handle.delete();
    }

    await client.schedule.create({
        action: {
            type: "startWorkflow",
            workflowType: reviewEmailWorkflow,
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

    Logger.info(scheduleId, "Email schedule workflow created successfully.");
}