import { Config } from "../../singletons/config";
import { Logger } from "../../singletons/logger";
import { createTemporalClient } from "../../singletons/temporal";
import { supabaseKeepaliveWorkflow } from "./workflow";

const scheduleId = "supabase-keepalive-schedule";

export async function createSupabaseKeepaliveSchedule(): Promise<void> {
    const client = await createTemporalClient();
    const scheduleList = client.schedule.list();

    for await (const schedule of scheduleList) {
        if (schedule.scheduleId === scheduleId) {
            Logger.debug(scheduleId, "Supabase keepalive schedule already exists.");
            return;
        }
    }

    Logger.info(scheduleId, "Creating Supabase keepalive schedule...");
    await client.schedule.create({
        action: {
            type: "startWorkflow",
            workflowType: supabaseKeepaliveWorkflow,
            args: [],
            taskQueue: Config.TEMPORAL_TASK_QUEUE,
        },
        scheduleId,
        spec: {
            intervals: [{
                every: "24 hours",
            }],
        },
    });

    Logger.info(scheduleId, "Supabase keepalive schedule created successfully.");
}

export async function deleteSupabaseKeepaliveSchedule(): Promise<void> {
    const client = await createTemporalClient();
    const scheduleList = client.schedule.list();

    for await (const schedule of scheduleList) {
        if (schedule.scheduleId === scheduleId) {
            Logger.debug(scheduleId, "Schedule already exists, deleting...");
            await client.schedule.getHandle(scheduleId).delete();
            return;
        }
    }
}