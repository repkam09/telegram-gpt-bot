import { Logger } from "../singletons/logger";

export abstract class Job {
    static async run(userId: number): Promise<void> {
        Logger.debug(undefined, "Running Sample Job for user", userId);
    }

    static schedule(): [string, string] {
        return ["* * * * *", "UTC"];
    }
}