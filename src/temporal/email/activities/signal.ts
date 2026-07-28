import { signalLegacyWorkflowAdminMessageExternalContext } from "../../legacy/interface";

export function signalSummary(summary: string): Promise<void> {
    return signalLegacyWorkflowAdminMessageExternalContext("scheduled_email_digest", summary);
}