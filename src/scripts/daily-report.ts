import dotenv from "dotenv";

import { Config } from "../singletons/config";
import { Database } from "../singletons/sqlite";
import { HennosUserAsync } from "../singletons/user";
import { DailyReport } from "../jobs/daily-report";

dotenv.config();

async function dailyReportTest() {
    await Database.init();

    const user = await HennosUserAsync(Config.TELEGRAM_BOT_ADMIN, "Mark");
    DailyReport.run(user);
}

dailyReportTest();
