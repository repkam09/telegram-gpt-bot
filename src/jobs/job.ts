import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";

export abstract class Job {
    static scheduled(user: HennosUser): void {
        Logger.info(user, "Job Scheduled");
    }

    static async run(user: HennosUser): Promise<void> {
        Logger.info(user, "Running Sample Job");
    }

    static schedule(): [string, string] {
        return ["* * * * *", "UTC"];
    }
}