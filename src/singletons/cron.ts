import cron from "node-cron";
import { HennosUser } from "./user";
import { Config } from "./config";
import { DailyReport } from "../jobs/DailyReport";
import { HennosConsumer } from "./base";
import { Logger } from "./logger";

export class ScheduleJob {
    public static async init() {
        const exists = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
        if (exists) {
            // Only schedule jobs for the admin right now. Eventually, we can add a
            // job table to the database and schedule jobs for all users
            const [schedule, timezone] = DailyReport.schedule();
            cron.schedule(schedule, () => DailyReport.run(exists), {
                timezone
            });
            DailyReport.scheduled(exists);
        }
    }

    public static async scheduleJob(user: HennosConsumer, schedule: string, prompt: string) {
        Logger.info(user, "ScheduleJob.scheduleJob", { schedule, prompt });
        // cron.schedule();
    }
}