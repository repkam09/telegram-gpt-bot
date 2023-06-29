import { CronJob } from "cron";
import { Logger } from "./logger";

export class Schedule {
    private static _instance: CronJob;
    private static _callbacks: { message: string, trigger: Date, callback: () => Promise<void> }[] = [];
    private static _callbacks_ticks: { message: string, minutes: number, current: number, callback: () => Promise<void> }[] = [];

    public static instance(): CronJob {
        if (!Schedule._instance) {
            Schedule._instance = new CronJob("* * * * *", Schedule.tick, undefined, false, "Etc/UTC", undefined, false, 0, undefined);
            Schedule._instance.start();
        }

        return Schedule._instance;
    }

    public static register(trigger: Date, callback: (() => Promise<void>), message: string): void {
        Logger.info("Registered Task " + message + ", trigger at " + trigger.toISOString());
        Schedule._callbacks.push({ trigger, callback, message });
    }

    public static recurring(minutes: number, callback: (() => Promise<void>), message: string): void {
        Logger.info("Registered Task " + message + ", " + minutes + " minute interval");
        Schedule._callbacks_ticks.push({minutes, current: 0, callback, message});
    }

    private static tick() {
        Logger.debug("Schedule Tick");
        Schedule._callbacks_ticks.forEach((fn) => {
            fn.current = fn.current + 1;
            
            if (fn.current > fn.minutes) {
                Logger.debug("Tick: Execute Task " + fn.message);
                try {
                    fn.current = 0;
                    fn.callback();
                } catch (err) {
                    // nothing
                }
            } else {
                Logger.debug("Tick: Skip Task " + fn.message);
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
