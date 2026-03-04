import { heartbeat } from "@temporalio/activity";

export function withActivityHeartbeat<
    ActivityArgs extends unknown[],
    ActivityReturn,
>(
    func: (...args: ActivityArgs) => Promise<ActivityReturn>,
    intervalMs = 5000,
): (...args: ActivityArgs) => Promise<ActivityReturn> {
    return async (...args: ActivityArgs): Promise<ActivityReturn> => {
        const interval = setInterval(() => {
            heartbeat();
        }, intervalMs);

        try {
            return await func(...args);
        } finally {
            clearInterval(interval);
        }
    };
}
