import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/consumer";

export abstract class Job {
    static async run(user: HennosUser): Promise<void> {
        Logger.debug(user, `Running Sample Job for user ${user}`);
    }

    static schedule(): [string, string] {
        return ["* * * * *", "UTC"];
    }
}