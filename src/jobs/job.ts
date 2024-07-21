import { Logger } from "../singletons/logger";
import { HennosUser } from "../singletons/user";

export abstract class Job {
    static async run(user: HennosUser): Promise<void> {
        Logger.info(user, "Running Sample Job");
    }

    static schedule(): string {
        return "* * * * *";
    }
}