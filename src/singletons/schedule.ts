import { CronJob } from "cron";

export class Schedule {
    private static _instance: CronJob;
    private static _callbacks: { trigger: Date, callback: () => Promise<void> }[] = [];
    private static _callbacks_ticks: { minutes: number, current: number, callback: () => Promise<void> }[] = [];

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

    public static recurring(minutes: number, callback: (() => Promise<void>)): void {
        Schedule._callbacks_ticks.push({minutes, current: 0, callback});
    }

    private static tick() {
        Schedule._callbacks_ticks.forEach((fn) => {
            fn.current = fn.current + 1;
            if (fn.current > fn.minutes) {
                try {
                    fn.callback();
                } catch (err) {
                    // nothing
                }
            }
        });

        Schedule._callbacks.forEach((fn) => {
            if (fn.trigger < new Date()) {
                try {
                    fn.callback();
                } catch (err) {
                    // nothing
                }
            }
        });
    }
}
