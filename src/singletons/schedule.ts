import { CronJob } from "cron";

export class Schedule {
    private static _instance: CronJob;
    private static _callbacks: { trigger: Date, callback: () => Promise<void> }[] = [];

    public static instance(): CronJob {
        if (!Schedule._instance) {
            Schedule._instance = new CronJob("* * * * *", Schedule.tick, undefined, false, "Etc/UTC", undefined, false, 0, undefined);
            Schedule._instance.start();
        }

        return Schedule._instance;
    }

    public static register(trigger: Date, callback: (() => Promise<void>)): void {
        Schedule._callbacks.push({ trigger, callback });
    }

    private static tick() {
        Schedule._callbacks.forEach((fn) => {
            if (fn.trigger < new Date()) {
                fn.callback();
            }
        });
    }
}
