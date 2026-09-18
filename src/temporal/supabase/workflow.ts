import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";

const { keepSupabaseActive } = proxyActivities<typeof activities>({
    startToCloseTimeout: "30 seconds",
    retry: {
        backoffCoefficient: 2,
        initialInterval: "5 seconds",
        maximumAttempts: 3,
    },
});

export async function supabaseKeepaliveWorkflow(): Promise<void> {
    await keepSupabaseActive();
}