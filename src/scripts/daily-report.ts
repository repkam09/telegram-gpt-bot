import dotenv from "dotenv";

import { Config } from "../singletons/config";
import { Database } from "../singletons/sqlite";
import { HennosUser } from "../singletons/user";
import { DailyReport } from "../jobs/DailyReport";

dotenv.config();

async function dailyReportTest() {
    await Database.init();

    const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
    if (!user) {
        throw new Error("Existing admin user account not found");
    }

    await DailyReport.run(user);
}

dailyReportTest();
