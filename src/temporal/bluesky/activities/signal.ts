import { signalAgenticWorkflowAdminExternalContext } from "../../agent/interface";

export function signalBlueskySummary(summary: string): Promise<void> {
    return signalAgenticWorkflowAdminExternalContext("scheduled_bluesky_digest", summary);
}