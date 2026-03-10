import { signalAgenticWorkflowAdminExternalContext } from "../../agent/interface";

export function signalSummary(summary: string): Promise<void> {
    return signalAgenticWorkflowAdminExternalContext("scheduled_email_digest", summary);
}